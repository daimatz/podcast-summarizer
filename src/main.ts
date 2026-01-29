/**
 * Podcast Summarizer - メインエントリーポイント
 *
 * 使用方法:
 * 1. clasp login でログイン
 * 2. clasp create または .clasp.json に scriptId を設定
 * 3. clasp push でデプロイ
 * 4. プロジェクト設定 > スクリプトプロパティで以下を設定:
 *    - LISTEN_NOTES_KEY: Listen Notes API キー
 *    - LEMONFOX_KEY: Lemonfox.ai API キー
 *    - CLAUDE_KEY: Claude API キー
 *    - NOTIFICATION_EMAIL: 通知先メールアドレス（省略時は実行ユーザーのメール）
 *    - PODCAST_<任意のキー>: 検索キーワード（例: PODCAST_1 = Rebuild）
 * 5. トリガーを GUI で設定（checkNewEpisodes を1時間おきなど）
 */

/**
 * メイン処理: 新規エピソードをチェックして処理（1回につき1件のみ）
 */
function checkNewEpisodes(): void {
  Logger.log('Starting checkNewEpisodes...');

  const podcasts = getPodcasts();
  if (podcasts.length === 0) {
    Logger.log('No podcasts registered. Add PODCAST_<key> properties in Script Properties.');
    return;
  }

  // PODCAST_ の昇順でソート
  podcasts.sort((a, b) => a.id.localeCompare(b.id));

  // 新エピソードを探して1件だけ処理
  for (const podcast of podcasts) {
    try {
      Logger.log(`Checking podcast: ${podcast.name} (${podcast.id})`);

      const lastChecked = getLastChecked(podcast.id);
      const episodes = searchEpisodes(podcast.name, lastChecked);

      // Listen Notes API レート制限対策 (2 req/s)
      Utilities.sleep(600);

      if (episodes.length === 0) {
        Logger.log('No new episodes');
        continue;
      }

      Logger.log(`Found ${episodes.length} new episode(s), processing the first one`);

      // 最初の1件だけ処理
      const episode = episodes[0];
      try {
        const doc = processEpisode(episode, podcast.name);

        // 処理したエピソードの公開日時を最終確認日時として設定
        setLastChecked(podcast.id, new Date(episode.pub_date_ms));

        // 通知送信
        sendNotification([doc]);

        Logger.log(`Finished. Created document: ${doc.url}`);
        return; // 1件処理したら終了

      } catch (e) {
        const error = e as Error;
        Logger.log(`Error processing episode ${episode.title}: ${error.message}`);
        sendErrorNotification(
          error,
          `${podcast.name} - ${episode.title}`
        );
        return; // エラーでも終了（次回リトライ）
      }

    } catch (e) {
      const error = e as Error;
      Logger.log(`Error checking podcast ${podcast.name}: ${error.message}`);
      // 検索エラーは次の Podcast を試す
      continue;
    }
  }

  Logger.log('No new episodes found for any podcast.');
}

/**
 * 単一エピソードを処理
 */
function processEpisode(episode: Episode, podcastName: string): CreatedDoc {
  Logger.log(`Processing: ${episode.title}`);

  // 1. 音声文字起こし
  Logger.log('Transcribing audio...');
  const rawTranscript = transcribeWithRetry(episode.audio);
  Logger.log(`Transcription complete: ${rawTranscript.length} characters`);

  // 2. テキスト整形（話者分離・セクション分け）
  Logger.log('Formatting transcript with speaker separation and sections...');
  const formatted = formatTranscript(rawTranscript);
  Logger.log(`Formatting complete: ${formatted.sections.length} sections`);

  // 3. サマリ生成
  Logger.log('Generating summaries...');
  const summary400Text = summarize400(formatted.fullText);
  const summary2000Text = summarize2000(formatted.fullText);
  Logger.log('Summaries complete');

  // 4. Google Docs作成
  Logger.log('Creating Google Doc...');
  const episodeInfo: EpisodeInfo = {
    title: episode.title,
    podcastName: podcastName,
    pubDate: new Date(episode.pub_date_ms),
    link: episode.link,
    audioUrl: episode.audio,
  };

  const doc = createEpisodeDoc(episodeInfo, formatted.sections, summary400Text, summary2000Text);

  // 5. フォルダに移動
  try {
    const folder = getOrCreatePodcastFolder(podcastName);
    moveDocToFolder(doc.docId, folder.getId());
    Logger.log(`Document moved to folder: ${podcastName}`);
  } catch (e) {
    Logger.log(`Warning: Could not move document to folder: ${(e as Error).message}`);
  }

  Logger.log(`Document created: ${doc.url}`);
  return doc;
}

