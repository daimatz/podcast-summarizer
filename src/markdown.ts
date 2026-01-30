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
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 100);
}

export interface CreatedMarkdown {
  title: string;
  filePath: string;
  relativePath: string;
}

export function createEpisodeMarkdown(
  episode: Episode,
  podcastName: string,
  formatted: FormattedTranscript,
  summary400: string,
  summary2000: string
): CreatedMarkdown {
  const dateStr = formatDate(new Date(episode.pubDateMs));
  const title = `[${podcastName}] ${episode.title} - ${dateStr}`;
  const filename = `${dateStr}-${sanitizeFilename(episode.title)}.md`;
  const podcastDir = sanitizeFilename(podcastName);

  const content = `---
title: "${episode.title.replace(/"/g, '\\"')}"
podcast: "${podcastName}"
date: ${dateStr}
link: ${cleanUrl(episode.link)}
audio: ${episode.audioUrl}
---

# ${episode.title}

**Podcast:** ${podcastName}
**公開日:** ${dateStr}
**リンク:** [${cleanUrl(episode.link)}](${cleanUrl(episode.link)})

---

## サマリ（400文字）

${summary400}

---

## サマリ（2000文字）

${summary2000}

---

## 全文書き起こし

${formatted.fullText}
`;

  const docsDir = path.join(process.cwd(), 'docs', 'episodes', podcastDir);
  fs.mkdirSync(docsDir, { recursive: true });

  const filePath = path.join(docsDir, filename);
  fs.writeFileSync(filePath, content);

  return {
    title,
    filePath,
    relativePath: `episodes/${podcastDir}/${filename}`,
  };
}

export function updateIndex(): void {
  const episodesDir = path.join(process.cwd(), 'docs', 'episodes');

  if (!fs.existsSync(episodesDir)) {
    return;
  }

  const podcasts = fs.readdirSync(episodesDir).filter((f) => {
    return fs.statSync(path.join(episodesDir, f)).isDirectory();
  });

  let indexContent = `# Podcast Summaries

`;

  for (const podcast of podcasts.sort()) {
    const podcastDir = path.join(episodesDir, podcast);
    const files = fs.readdirSync(podcastDir).filter((f) => f.endsWith('.md')).sort().reverse();

    if (files.length === 0) continue;

    indexContent += `## ${podcast}\n\n`;

    for (const file of files.slice(0, 10)) {
      const filePath = path.join(podcastDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const titleMatch = content.match(/^# (.+)$/m);
      const title = titleMatch ? titleMatch[1] : file.replace('.md', '');
      indexContent += `- [${title}](episodes/${podcast}/${file})\n`;
    }

    if (files.length > 10) {
      indexContent += `- ... and ${files.length - 10} more\n`;
    }

    indexContent += '\n';
  }

  fs.writeFileSync(path.join(process.cwd(), 'docs', 'index.md'), indexContent);
}
