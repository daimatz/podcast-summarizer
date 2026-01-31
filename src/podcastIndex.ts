import * as crypto from 'crypto';
import { getEnv } from './config.js';

const PODCAST_INDEX_BASE_URL = 'https://api.podcastindex.org/api/1.0';
const REQUEST_INTERVAL_MS = 200; // 5 requests/second max

let lastRequestTime = 0;

async function throttle(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < REQUEST_INTERVAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, REQUEST_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

export interface Episode {
  id: string;
  title: string;
  description: string;
  pubDateMs: number;
  audioUrl: string;
  audioLengthSec: number;
  link: string;
  podcastId: string;
  podcastTitle: string;
}

interface PodcastIndexEpisode {
  id: number;
  title: string;
  description: string;
  datePublished: number;
  enclosureUrl: string;
  enclosureLength: number;
  duration: number;
  link: string;
  feedId: number;
  feedTitle: string;
}

interface EpisodesByFeedIdResponse {
  status: string;
  items: PodcastIndexEpisode[];
  count: number;
}

function getPodcastIndexHeaders(): Record<string, string> {
  const apiKey = getEnv('PI_API_KEY');
  const apiSecret = getEnv('PI_API_SECRET');
  const authDate = Math.floor(Date.now() / 1000);

  const dataToHash = apiKey + apiSecret + authDate;
  const authHash = crypto.createHash('sha1').update(dataToHash).digest('hex');

  return {
    'X-Auth-Key': apiKey,
    'X-Auth-Date': authDate.toString(),
    'Authorization': authHash,
    'User-Agent': 'PodcastSummarizer/1.0',
  };
}

function toEpisode(item: PodcastIndexEpisode): Episode {
  return {
    id: item.id.toString(),
    title: item.title,
    description: item.description || '',
    pubDateMs: item.datePublished * 1000,
    audioUrl: item.enclosureUrl,
    audioLengthSec: item.duration,
    link: item.link || '',
    podcastId: item.feedId.toString(),
    podcastTitle: item.feedTitle,
  };
}

export async function getEpisodesByFeedId(feedId: string, since: Date | null): Promise<Episode[]> {
  let url = `${PODCAST_INDEX_BASE_URL}/episodes/byfeedid?id=${feedId}`;

  if (since) {
    const sinceTimestamp = Math.floor(since.getTime() / 1000);
    url += `&since=${sinceTimestamp}`;
  }

  await throttle();
  const response = await fetch(url, {
    method: 'GET',
    headers: getPodcastIndexHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Podcast Index API error: ${response.status} - ${await response.text()}`);
  }

  const data = (await response.json()) as EpisodesByFeedIdResponse;

  if (data.status !== 'true' || !data.items) {
    return [];
  }

  const sortedItems = data.items.sort((a, b) => b.datePublished - a.datePublished);

  if (!since) {
    return sortedItems.slice(0, 1).map(toEpisode);
  }

  return sortedItems.map(toEpisode);
}

export async function searchPodcastByName(query: string): Promise<{ feedId: string; title: string }[]> {
  const url = `${PODCAST_INDEX_BASE_URL}/search/byterm?q=${encodeURIComponent(query)}`;

  await throttle();
  const response = await fetch(url, {
    method: 'GET',
    headers: getPodcastIndexHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Podcast Index API error: ${response.status} - ${await response.text()}`);
  }

  interface SearchResponse {
    status: string;
    feeds: Array<{ id: number; title: string }>;
  }

  const data = (await response.json()) as SearchResponse;

  if (data.status !== 'true' || !data.feeds) {
    return [];
  }

  return data.feeds.map((f) => ({
    feedId: f.id.toString(),
    title: f.title,
  }));
}
