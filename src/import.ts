import * as fs from 'fs';
import * as path from 'path';
import { getConfig } from './config.js';
import { getEpisodesByFeedId, type Episode } from './podcastIndex.js';
import { transcribeWithRetry } from './lemonfox.js';
import { formatTranscript, summarize400, summarize2000 } from './claude.js';
import { createEpisodeMarkdown, type CreatedMarkdown } from './markdown.js';
import pLimit from 'p-limit';

interface ProcessedEpisode {
  episode: Episode;
  markdown: CreatedMarkdown;
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\?%*:|"<>#]/g, '-')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 100);
}

function isAlreadyImported(episodeId: string, podcastName: string): boolean {
  const podcastDir = path.join(process.cwd(), 'episodes', sanitizeFilename(podcastName));

  if (!fs.existsSync(podcastDir)) {
    return false;
  }

  const files = fs.readdirSync(podcastDir);
  // ファイル名に episode.id が含まれているかチェック
  // 形式: {date}-{episodeId}-{title}.md
  return files.some((file) => file.includes(`-${episodeId}-`));
}

async function processEpisode(episode: Episode, podcastName: string): Promise<CreatedMarkdown> {
  console.log(`Processing: ${episode.title}`);
  console.log(`Audio URL: ${episode.audioUrl}`);

  console.log('Transcribing audio...');
  const rawTranscript = await transcribeWithRetry(episode.audioUrl);
  console.log(`Transcription complete: ${rawTranscript.length} characters`);

  console.log('Formatting transcript...');
  const formatted = await formatTranscript(rawTranscript);
  console.log(`Formatting complete: ${formatted.sections.length} sections`);

  console.log('Generating summaries...');
  const summary400Text = await summarize400(formatted.fullText);
  const summary2000Text = await summarize2000(formatted.fullText);
  console.log('Summaries complete');

  console.log('Creating Markdown...');
  const markdown = createEpisodeMarkdown(episode, podcastName, formatted, summary400Text, summary2000Text);
  console.log(`Markdown created: ${markdown.filePath}`);

  return markdown;
}

async function main(): Promise<void> {
  const podcastIndexId = process.env.PODCAST_INDEX_ID;
  const lastN = parseInt(process.env.LAST_N || '5', 10);

  if (!podcastIndexId) {
    console.error('PODCAST_INDEX_ID is required');
    process.exit(1);
  }

  // 設定ファイルからポッドキャスト名を取得
  const config = getConfig();
  const podcast = config.podcasts.find((p) => p.podcastIndexId === podcastIndexId);

  if (!podcast) {
    console.error(`Podcast with ID ${podcastIndexId} not found in config/podcast-index.yaml`);
    console.error('Please add it to the config file first.');
    process.exit(1);
  }

  const podcastName = podcast.name;
  console.log(`Importing last ${lastN} episodes from ${podcastName} (ID: ${podcastIndexId})`);

  // 全エピソードを取得（sinceをnullにすると最新1件のみなので、古い日付を指定）
  const farPast = new Date('2000-01-01');
  const episodes = await getEpisodesByFeedId(podcastIndexId, farPast);

  console.log(`Found ${episodes.length} episodes total`);

  // 最新N件を取得
  const targetEpisodes = episodes.slice(0, lastN);
  console.log(`Targeting ${targetEpisodes.length} episodes`);

  // 重複チェックしてフィルタ
  const newEpisodes = targetEpisodes.filter((ep) => {
    if (isAlreadyImported(ep.id, podcastName)) {
      console.log(`Skip (already imported): ${ep.title}`);
      return false;
    }
    return true;
  });

  if (newEpisodes.length === 0) {
    console.log('No new episodes to import');
    return;
  }

  console.log(`Importing ${newEpisodes.length} new episode(s) with concurrency limit of 3...`);

  const limit = pLimit(3);
  const results = await Promise.all(
    newEpisodes.map((episode) =>
      limit(async (): Promise<ProcessedEpisode | null> => {
        try {
          const markdown = await processEpisode(episode, podcastName);
          return { episode, markdown };
        } catch (e) {
          console.error(`Error processing episode ${episode.title}:`, e);
          return null;
        }
      })
    )
  );

  const processed = results.filter((r): r is ProcessedEpisode => r !== null);

  if (processed.length > 0) {
    console.log('\n=== Imported Episodes ===');
    for (const { markdown } of processed) {
      console.log(`- ${markdown.title}`);
    }

    // GitHub Actions 用の出力
    const githubOutput = process.env.GITHUB_OUTPUT;
    if (githubOutput) {
      const episodeItems = processed
        .map((p) => {
          const url = `https://github.com/${process.env.GITHUB_REPOSITORY}/blob/main/${encodeURI(p.markdown.relativePath)}`;
          return `<li><a href="${url}">${p.markdown.title}</a></li>`;
        })
        .join('\n');
      const episodeList = `<ul>\n${episodeItems}\n</ul>`;
      fs.appendFileSync(githubOutput, `episodes<<EOF\n${episodeList}\nEOF\n`);
    }
  }

  console.log('Import complete');
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
