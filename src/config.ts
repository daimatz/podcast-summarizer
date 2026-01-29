/**
 * PropertiesService を使用した設定管理モジュール
 */

interface ApiKeys {
  LISTEN_NOTES_KEY: string;
  LEMONFOX_KEY: string;
  CLAUDE_KEY: string;
}

interface PodcastEntry {
  id: string;
  name: string;
}

/**
 * API キーを取得
 */
function getApiKeys(): ApiKeys {
  const props = PropertiesService.getScriptProperties();
  return {
    LISTEN_NOTES_KEY: props.getProperty('LISTEN_NOTES_KEY') || '',
    LEMONFOX_KEY: props.getProperty('LEMONFOX_KEY') || '',
    CLAUDE_KEY: props.getProperty('CLAUDE_KEY') || '',
  };
}

/**
 * 購読 Podcast リストを取得
 *
 * スクリプトプロパティで以下の形式で設定:
 *   PODCAST_<任意のキー> = 検索キーワード
 *
 * 例:
 *   PODCAST_1 = Rebuild
 *   PODCAST_2 = backspace.fm
 *
 * 検索キーワードは Listen Notes の検索 API で使用される
 */
function getPodcasts(): PodcastEntry[] {
  const props = PropertiesService.getScriptProperties();
  const allProps = props.getProperties();
  const podcasts: PodcastEntry[] = [];

  for (const key in allProps) {
    if (key.startsWith('PODCAST_')) {
      const id = key.substring('PODCAST_'.length);
      const name = allProps[key];
      if (id && name) {
        podcasts.push({ id, name });
      }
    }
  }

  return podcasts;
}

/**
 * Podcast を追加
 */
function addPodcast(podcastId: string, name: string): void {
  const props = PropertiesService.getScriptProperties();
  const key = `PODCAST_${podcastId}`;
  if (props.getProperty(key)) {
    Logger.log(`Podcast ${podcastId} is already registered.`);
    return;
  }
  props.setProperty(key, name);
  Logger.log(`Added podcast: ${name} (${podcastId})`);
}

/**
 * Podcast を削除
 */
function removePodcast(podcastId: string): void {
  const props = PropertiesService.getScriptProperties();
  const key = `PODCAST_${podcastId}`;
  props.deleteProperty(key);
  Logger.log(`Removed podcast: ${podcastId}`);
}

/**
 * 最終確認日時を取得
 */
function getLastChecked(podcastId: string): Date | null {
  const props = PropertiesService.getScriptProperties();
  const timestamp = props.getProperty(`LAST_CHECKED_${podcastId}`);
  if (!timestamp) return null;
  return new Date(parseInt(timestamp, 10));
}

/**
 * 最終確認日時を設定
 */
function setLastChecked(podcastId: string, date: Date): void {
  const props = PropertiesService.getScriptProperties();
  props.setProperty(`LAST_CHECKED_${podcastId}`, date.getTime().toString());
}

/**
 * 通知先メールアドレスを取得
 */
function getNotificationEmail(): string {
  const props = PropertiesService.getScriptProperties();
  return props.getProperty('NOTIFICATION_EMAIL') || Session.getActiveUser().getEmail();
}

/**
 * 通知先メールアドレスを設定
 */
function setNotificationEmail(email: string): void {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('NOTIFICATION_EMAIL', email);
  Logger.log(`Notification email set to: ${email}`);
}
