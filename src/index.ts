import { getConfig, getLastChecked, setLastChecked } from './config.js';
import { getEpisodesByFeedId, type Episode } from './podcastIndex.js';
import { transcribeWithRetry } from './lemonfox.js';
import { formatTranscript, summarize400, summarize2000 } from './claude.js';
import { createEpisodeMarkdown, type CreatedMarkdown } from './markdown.js';

interface ProcessedEpisode {
  episode: Episode;
  markdown: CreatedMarkdown;
}

async function processEpisode(episode: Episode, podcastName: string): Promise<CreatedMarkdown> {
  console.log(`Processing: ${episode.title}`);
  console.log(`Audio URL: ${episode.audioUrl}`);

  // 1. 音声文字起こし
  console.log('Transcribing audio...');
  const rawTranscript = await transcribeWithRetry(episode.audioUrl);
  console.log(`Transcription complete: ${rawTranscript.length} characters`);

  // 2. テキスト整形（話者分離・セクション分け）
  console.log('Formatting transcript...');
  const formatted = await formatTranscript(rawTranscript);
  console.log(`Formatting complete: ${formatted.sections.length} sections`);

  // 3. サマリ生成
  console.log('Generating summaries...');
  const summary400Text = await summarize400(formatted.fullText);
  const summary2000Text = await summarize2000(formatted.fullText);
  console.log('Summaries complete');

  // 4. Markdown作成
  console.log('Creating Markdown...');
  const markdown = createEpisodeMarkdown(episode, podcastName, formatted, summary400Text, summary2000Text);
  console.log(`Markdown created: ${markdown.filePath}`);

  return markdown;
}

async function main(): Promise<void> {
  console.log('Starting podcast summarizer...');

  const config = getConfig();

  if (config.podcasts.length === 0) {
    console.log('No podcasts configured. Add podcasts to config/podcasts.json');
    return;
  }

  const processed: ProcessedEpisode[] = [];

  for (const podcast of config.podcasts) {
    try {
      console.log(`\nChecking podcast: ${podcast.name} (feedId: ${podcast.feedId})`);

      const lastChecked = getLastChecked(podcast.feedId);
      console.log(`Last checked: ${lastChecked?.toISOString() ?? 'never'}`);

      const episodes = await getEpisodesByFeedId(podcast.feedId, lastChecked);

      if (episodes.length === 0) {
        console.log('No new episodes');
        continue;
      }

      console.log(`Found ${episodes.length} new episode(s)`);

      for (const episode of episodes) {
        try {
          const markdown = await processEpisode(episode, podcast.name);
          processed.push({ episode, markdown });

          // 処理したエピソードの公開日時を最終確認日時として設定
          setLastChecked(podcast.feedId, new Date(episode.pubDateMs));
        } catch (e) {
          console.error(`Error processing episode ${episode.title}:`, e);
        }
      }
    } catch (e) {
      console.error(`Error checking podcast ${podcast.name}:`, e);
    }
  }

  if (processed.length > 0) {
    // 処理結果を出力（GitHub Actions で使用）
    console.log('\n=== Processed Episodes ===');
    for (const { episode, markdown } of processed) {
      console.log(`- ${markdown.title}`);
    }

    // GitHub Actions 用の出力（GITHUB_OUTPUT環境ファイルを使用）
    const githubOutput = process.env.GITHUB_OUTPUT;
    if (githubOutput) {
      const fs = await import('fs');
      const episodeItems = processed
        .map((p) => {
          const url = `https://github.com/${process.env.GITHUB_REPOSITORY}/blob/main/${encodeURI(p.markdown.relativePath)}`;
          return `<li><a href="${url}">${p.markdown.title}</a></li>`;
        })
        .join('\n');
      const episodeList = `<ul>\n${episodeItems}\n</ul>`;
      fs.appendFileSync(githubOutput, `episodes<<EOF\n${episodeList}\nEOF\n`);
    }
  } else {
    console.log('\nNo new episodes processed');
  }
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
