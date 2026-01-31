import * as fs from 'fs';
import * as path from 'path';
import type { Episode } from './podcastIndex.js';
import type { FormattedTranscript } from './claude.js';

function cleanUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'fbclid', 'gclid', 'gclsrc', 'dclid',
      'msclkid', 'twclid', 'li_fat_id',
      'mc_cid', 'mc_eid',
      'ref', 'ref_src', 'ref_url',
      '_ga', '_gl', '_hsenc', '_hsmi',
    ];
    trackingParams.forEach((param) => urlObj.searchParams.delete(param));
    return urlObj.toString();
  } catch {
    return url;
  }
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\?%*:|"<>#]/g, '-')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 100);
}

export interface CreatedMarkdown {
  title: string;
  filePath: string;
  relativePath: string;
}

export interface TranslatedContent {
  summary400: string;
  summary2000: string;
  fullText: string;
}

export function createEpisodeMarkdown(
  episode: Episode,
  podcastName: string,
  formatted: FormattedTranscript,
  summary400: string,
  summary2000: string,
  sourceLanguage: string = 'ja',
  translated?: TranslatedContent
): CreatedMarkdown {
  const dateStr = formatDate(new Date(episode.pubDateMs));
  const title = `[${podcastName}] ${episode.title} - ${dateStr}`;
  const filename = `${dateStr}-${episode.id}-${sanitizeFilename(episode.title)}.md`;
  const podcastDir = sanitizeFilename(podcastName);

  const needsTranslation = sourceLanguage !== 'ja' && translated;

  const content = `---
episode_id: ${episode.id}
title: "${episode.title.replace(/"/g, '\\"')}"
podcast: "${podcastName}"
date: ${dateStr}
link: ${cleanUrl(episode.link)}
audio: ${episode.audioUrl}
language: ${sourceLanguage}
---

# ${episode.title}

- **Podcast:** ${podcastName}
- **公開日:** ${dateStr}
- **リンク:** [${cleanUrl(episode.link)}](${cleanUrl(episode.link)})
- **元の言語:** ${sourceLanguage}

---

## サマリ（400文字）

${needsTranslation ? translated.summary400 : summary400}

---

## サマリ（2000文字）

${needsTranslation ? translated.summary2000 : summary2000}

---

## 全文書き起こし

${needsTranslation ? translated.fullText : formatted.fullText}
${needsTranslation ? `
---

## 原文サマリ（400文字）

${summary400}

---

## 原文サマリ（2000文字）

${summary2000}

---

## 原文書き起こし

${formatted.fullText}
` : ''}`;

  const episodesDir = path.join(process.cwd(), 'episodes', podcastDir);
  fs.mkdirSync(episodesDir, { recursive: true });

  const filePath = path.join(episodesDir, filename);
  fs.writeFileSync(filePath, content);

  return {
    title,
    filePath,
    relativePath: `episodes/${podcastDir}/${filename}`,
  };
}

