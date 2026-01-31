import { getConfig, getLastChecked, setLastChecked } from './config.js';
import { getEpisodesByFeedId, type Episode } from './podcastIndex.js';
import { transcribeWithRetry } from './lemonfox.js';
import { formatTranscript, summarize400, summarize2000, translateToJapanese } from './claude.js';
import { createEpisodeMarkdown, type CreatedMarkdown, type TranslatedContent } from './markdown.js';
import pLimit from 'p-limit';

interface ProcessedEpisode {
  episode: Episode;
  markdown: CreatedMarkdown;
  podcastName: string;
  podcastIndexId: string;
}

async function processEpisode(episode: Episode, podcastName: string, sourceLanguage: string): Promise<CreatedMarkdown> {
  console.log(`Processing: ${episode.title}`);
  console.log(`Audio URL: ${episode.audioUrl}`);
  console.log(`Source language: ${sourceLanguage}`);

  // 1. 音声文字起こし
  console.log('Transcribing audio...');
  const rawTranscript = await transcribeWithRetry(episode.audioUrl, sourceLanguage);
  console.log(`Transcription complete: ${rawTranscript.length} characters`);

  // 2. テキスト整形（話者分離・セクション分け）- 元の言語で処理
  console.log('Formatting transcript...');
  const formatted = await formatTranscript(rawTranscript, sourceLanguage);
  console.log(`Formatting complete: ${formatted.sections.length} sections`);

  // 3. サマリ生成 - 元の言語で処理
  console.log('Generating summaries...');
  const summary400Text = await summarize400(formatted.fullText, sourceLanguage);
  const summary2000Text = await summarize2000(formatted.fullText, sourceLanguage);
  console.log('Summaries complete');

  // 4. 翻訳（日本語以外の場合）
  let translated: TranslatedContent | undefined;
  if (sourceLanguage !== 'ja') {
    console.log('Translating to Japanese...');
    const [translatedSummary400, translatedSummary2000, translatedFullText] = await Promise.all([
      translateToJapanese(summary400Text, sourceLanguage),
      translateToJapanese(summary2000Text, sourceLanguage),
      translateToJapanese(formatted.fullText, sourceLanguage),
    ]);
    translated = {
      summary400: translatedSummary400,
      summary2000: translatedSummary2000,
      fullText: translatedFullText,
    };
    console.log('Translation complete');
  }

  // 5. Markdown作成
  console.log('Creating Markdown...');
  const markdown = createEpisodeMarkdown(episode, podcastName, formatted, summary400Text, summary2000Text, sourceLanguage, translated);
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

  // 全ポッドキャストから新着エピソードを収集
  const allTasks: Array<{ episode: Episode; podcastName: string; podcastIndexId: string; language: string }> = [];

  for (const podcast of config.podcasts) {
    try {
      console.log(`\nChecking podcast: ${podcast.name} (id: ${podcast.podcastIndexId}, language: ${podcast.language})`);

      const lastChecked = getLastChecked(podcast.podcastIndexId);
      console.log(`Last checked: ${lastChecked?.toISOString() ?? 'never'}`);

      const episodes = await getEpisodesByFeedId(podcast.podcastIndexId, lastChecked);

      if (episodes.length === 0) {
        console.log('No new episodes');
        continue;
      }

      console.log(`Found ${episodes.length} new episode(s)`);

      for (const episode of episodes) {
        allTasks.push({ episode, podcastName: podcast.name, podcastIndexId: podcast.podcastIndexId, language: podcast.language });
      }
    } catch (e) {
      console.error(`Error checking podcast ${podcast.name}:`, e);
    }
  }

  if (allTasks.length === 0) {
    console.log('\nNo new episodes to process');
    return;
  }

  console.log(`\nProcessing ${allTasks.length} episode(s) with concurrency limit of 5...`);

  // 5並列で処理
  const limit = pLimit(5);
  const results = await Promise.all(
    allTasks.map((task) =>
      limit(async (): Promise<ProcessedEpisode | null> => {
        try {
          const markdown = await processEpisode(task.episode, task.podcastName, task.language);
          return { episode: task.episode, markdown, podcastName: task.podcastName, podcastIndexId: task.podcastIndexId };
        } catch (e) {
          console.error(`Error processing episode ${task.episode.title}:`, e);
          return null;
        }
      })
    )
  );

  const processed = results.filter((r): r is ProcessedEpisode => r !== null);

  // 処理成功したエピソードのlastCheckedを更新（podcastIndexIdごとに最新のpubDateを設定）
  const latestByFeed = new Map<string, number>();
  for (const p of processed) {
    const current = latestByFeed.get(p.podcastIndexId) ?? 0;
    if (p.episode.pubDateMs > current) {
      latestByFeed.set(p.podcastIndexId, p.episode.pubDateMs);
    }
  }
  for (const [podcastIndexId, pubDateMs] of latestByFeed) {
    setLastChecked(podcastIndexId, new Date(pubDateMs));
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
