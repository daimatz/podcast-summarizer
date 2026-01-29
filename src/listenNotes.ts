/**
 * Listen Notes API クライアント
 * https://www.listennotes.com/api/docs/
 *
 * Free プランでは /podcasts/{id}/episodes が使えないため、
 * 検索 API を使用してエピソードを取得する
 */

const LISTEN_NOTES_BASE_URL = 'https://listen-api.listennotes.com/api/v2';

interface Episode {
  id: string;
  title: string;
  description: string;
  pub_date_ms: number;
  audio: string;
  audio_length_sec: number;
  link: string;
  podcast: {
    id: string;
    title: string;
  };
}

interface SearchResult {
  id: string;
  title_original: string;
  description_original: string;
  pub_date_ms: number;
  audio: string;
  audio_length_sec: number;
  link: string;
  podcast: {
    id: string;
    title_original: string;
  };
}

interface SearchResponse {
  count: number;
  total: number;
  results: SearchResult[];
}

/**
 * 検索結果を Episode 形式に変換
 */
function searchResultToEpisode(result: SearchResult): Episode {
  return {
    id: result.id,
    title: result.title_original,
    description: result.description_original,
    pub_date_ms: result.pub_date_ms,
    audio: result.audio,
    audio_length_sec: result.audio_length_sec,
    link: result.link,
    podcast: {
      id: result.podcast.id,
      title: result.podcast.title_original,
    },
  };
}

/**
 * 新規エピソードを検索
 * @param podcastName Podcast 名（検索キーワード）
 * @param since この日時以降のエピソードを取得
 */
function searchEpisodes(podcastName: string, since: Date | null): Episode[] {
  const apiKey = getApiKeys().LISTEN_NOTES_KEY;
  if (!apiKey) {
    throw new Error('Listen Notes API key is not configured');
  }

  // Podcast 名でエピソードを検索（日付順）
  const query = encodeURIComponent(podcastName);
  const url = `${LISTEN_NOTES_BASE_URL}/search?q=${query}&type=episode&sort_by_date=1`;

  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: {
      'X-ListenAPI-Key': apiKey,
    },
    muteHttpExceptions: true,
  });

  if (response.getResponseCode() !== 200) {
    throw new Error(`Listen Notes API error: ${response.getResponseCode()} - ${response.getContentText()}`);
  }

  const data = JSON.parse(response.getContentText()) as SearchResponse;

  // Podcast 名が一致するエピソードのみをフィルタ
  const matchingResults = data.results.filter(r =>
    r.podcast.title_original.toLowerCase().includes(podcastName.toLowerCase())
  );

  if (!since) {
    // 初回は最新の1エピソードのみ取得
    return matchingResults.slice(0, 1).map(searchResultToEpisode);
  }

  // since以降のエピソードをフィルタ
  const sinceMs = since.getTime();
  return matchingResults
    .filter(r => r.pub_date_ms > sinceMs)
    .map(searchResultToEpisode);
}

/**
 * エピソード詳細を取得（検索結果から取得するため、このバージョンでは使用しない）
 * @param episodeId Episode ID
 */
function getEpisodeDetails(episodeId: string): Episode {
  const apiKey = getApiKeys().LISTEN_NOTES_KEY;
  if (!apiKey) {
    throw new Error('Listen Notes API key is not configured');
  }

  const url = `${LISTEN_NOTES_BASE_URL}/episodes/${episodeId}`;

  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: {
      'X-ListenAPI-Key': apiKey,
    },
    muteHttpExceptions: true,
  });

  if (response.getResponseCode() !== 200) {
    throw new Error(`Listen Notes API error: ${response.getResponseCode()} - ${response.getContentText()}`);
  }

  return JSON.parse(response.getContentText()) as Episode;
}
