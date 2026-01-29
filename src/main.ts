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
 * 5. GAS エディタで setupTrigger() を実行
 */

/**
 * メイン処理: 新規エピソードをチェックして処理
 */
function checkNewEpisodes(): void {
  Logger.log('Starting checkNewEpisodes...');

  const podcasts = getPodcasts();
  if (podcasts.length === 0) {
    Logger.log('No podcasts registered. Add PODCAST_<id> properties in Script Properties.');
    return;
  }

  const createdDocs: CreatedDoc[] = [];
  const errors: Array<{ podcast: string; error: Error }> = [];

  for (const podcast of podcasts) {
    try {
      Logger.log(`Checking podcast: ${podcast.name} (${podcast.id})`);

      const lastChecked = getLastChecked(podcast.id);
      const episodes = searchEpisodes(podcast.name, lastChecked);

      Logger.log(`Found ${episodes.length} new episode(s)`);

      for (const episode of episodes) {
        try {
          const doc = processEpisode(episode, podcast.name);
          createdDocs.push(doc);
        } catch (e) {
          const error = e as Error;
          Logger.log(`Error processing episode ${episode.title}: ${error.message}`);
          errors.push({ podcast: `${podcast.name} - ${episode.title}`, error });
        }
      }

      // 最終確認日時を更新
      setLastChecked(podcast.id, new Date());

    } catch (e) {
      const error = e as Error;
      Logger.log(`Error checking podcast ${podcast.name}: ${error.message}`);
      errors.push({ podcast: podcast.name, error });
    }
  }

  // 通知送信
  if (createdDocs.length > 0) {
    sendNotification(createdDocs);
  }

  // エラー通知
  if (errors.length > 0) {
    const errorSummary = errors.map(e => `${e.podcast}: ${e.error.message}`).join('\n');
    sendErrorNotification(
      new Error(errorSummary),
      `checkNewEpisodes - ${errors.length} error(s) occurred`
    );
  }

  Logger.log(`Finished. Created ${createdDocs.length} document(s), ${errors.length} error(s).`);
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

  // 2. テキスト整形
  Logger.log('Formatting transcript...');
  const formattedTranscript = formatTranscript(rawTranscript);
  Logger.log('Formatting complete');

  // 3. サマリ生成
  Logger.log('Generating summaries...');
  const summary400Text = summarize400(formattedTranscript);
  const summary2000Text = summarize2000(formattedTranscript);
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

  const doc = createEpisodeDoc(episodeInfo, formattedTranscript, summary400Text, summary2000Text);

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

/**
 * 毎日8時のトリガーを設定
 */
function setupTrigger(): void {
  // 既存のトリガーを削除
  deleteTrigger();

  // 新しいトリガーを作成
  ScriptApp.newTrigger('checkNewEpisodes')
    .timeBased()
    .atHour(8)
    .everyDays(1)
    .inTimezone('Asia/Tokyo')
    .create();

  Logger.log('Trigger set up: checkNewEpisodes will run daily at 8:00 AM JST');
}

/**
 * トリガーを削除
 */
function deleteTrigger(): void {
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === 'checkNewEpisodes') {
      ScriptApp.deleteTrigger(trigger);
      Logger.log('Existing trigger deleted');
    }
  }
}

/**
 * Listen Notes API の接続テスト
 */
function testListenNotesApi(): void {
  const apiKey = getApiKeys().LISTEN_NOTES_KEY;

  Logger.log(`API Key (first 10 chars): ${apiKey.substring(0, 10)}...`);

  // Podcast 名 + episode で検索
  const searchUrl = `https://listen-api.listennotes.com/api/v2/search?q=rebuild%20podcast%20miyagawa&type=episode&sort_by_date=1`;
  Logger.log(`Search URL: ${searchUrl}`);

  const searchResponse = UrlFetchApp.fetch(searchUrl, {
    method: 'get',
    headers: { 'X-ListenAPI-Key': apiKey },
    muteHttpExceptions: true,
  });

  Logger.log(`Search Response Code: ${searchResponse.getResponseCode()}`);
  Logger.log(`Response: ${searchResponse.getContentText().substring(0, 2000)}`);
}

/**
 * 設定状態を確認
 */
function checkConfiguration(): void {
  const keys = getApiKeys();
  const podcasts = getPodcasts();
  const email = getNotificationEmail();

  Logger.log('=== Configuration Status ===');
  Logger.log(`Listen Notes API Key: ${keys.LISTEN_NOTES_KEY ? 'Set' : 'Not set'}`);
  Logger.log(`Lemonfox API Key: ${keys.LEMONFOX_KEY ? 'Set' : 'Not set'}`);
  Logger.log(`Claude API Key: ${keys.CLAUDE_KEY ? 'Set' : 'Not set'}`);
  Logger.log(`Notification Email: ${email || 'Not set'}`);
  Logger.log(`Registered Podcasts: ${podcasts.length}`);

  for (const podcast of podcasts) {
    const lastChecked = getLastChecked(podcast.id);
    Logger.log(`  - ${podcast.name} (${podcast.id})`);
    Logger.log(`    Last checked: ${lastChecked ? lastChecked.toISOString() : 'Never'}`);
  }

  const triggers = ScriptApp.getProjectTriggers();
  const hasScheduledTrigger = triggers.some(t => t.getHandlerFunction() === 'checkNewEpisodes');
  Logger.log(`Scheduled Trigger: ${hasScheduledTrigger ? 'Active' : 'Not set'}`);
}

/**
 * テスト用: 特定のエピソードを処理
 */
function testProcessEpisode(): void {
  const episodeId = 'YOUR_EPISODE_ID';

  try {
    const episode = getEpisodeDetails(episodeId);
    const doc = processEpisode(episode, episode.podcast.title);
    Logger.log(`Test successful: ${doc.url}`);
  } catch (e) {
    Logger.log(`Test failed: ${(e as Error).message}`);
  }
}
