import * as fs from 'fs';
import * as path from 'path';
import { getConfig } from './config.js';
import { getEpisodesByFeedId } from './podcastIndex.js';

function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\?%*:|"<>#]/g, '-')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 100);
}

interface FileMeta {
  filePath: string;
  fileName: string;
  podcast: string;
  date: string;
  title: string;
}

function parseExistingFile(filePath: string): FileMeta | null {
  const content = fs.readFileSync(filePath, 'utf-8');
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

  if (!frontmatterMatch) {
    return null;
  }

  const frontmatter = frontmatterMatch[1];

  // すでにepisode_idがある場合はスキップ
  if (frontmatter.includes('episode_id:')) {
    return null;
  }

  const podcastMatch = frontmatter.match(/podcast:\s*"?([^"\n]+)"?/);
  const dateMatch = frontmatter.match(/date:\s*(\d{4}-\d{2}-\d{2})/);
  const titleMatch = frontmatter.match(/title:\s*"?([^"\n]+)"?/);

  if (!podcastMatch || !dateMatch || !titleMatch) {
    return null;
  }

  return {
    filePath,
    fileName: path.basename(filePath),
    podcast: podcastMatch[1].trim(),
    date: dateMatch[1],
    title: titleMatch[1].replace(/\\"/g, '"').trim(),
  };
}

async function main(): Promise<void> {
  const episodesDir = path.join(process.cwd(), 'episodes');

  if (!fs.existsSync(episodesDir)) {
    console.log('No episodes directory found');
    return;
  }

  const config = getConfig();
  const podcastDirs = fs.readdirSync(episodesDir);

  let migratedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const podcastDir of podcastDirs) {
    const podcastPath = path.join(episodesDir, podcastDir);
    if (!fs.statSync(podcastPath).isDirectory()) continue;

    const files = fs.readdirSync(podcastPath).filter((f) => f.endsWith('.md'));

    for (const file of files) {
      const filePath = path.join(podcastPath, file);
      const meta = parseExistingFile(filePath);

      if (!meta) {
        console.log(`Skip (already migrated or invalid): ${file}`);
        skippedCount++;
        continue;
      }

      // 設定ファイルからポッドキャストIDを取得
      const podcastConfig = config.podcasts.find(
        (p) => sanitizeFilename(p.name) === podcastDir || p.name === meta.podcast
      );

      if (!podcastConfig) {
        console.log(`Skip (podcast not in config): ${meta.podcast}`);
        skippedCount++;
        continue;
      }

      console.log(`Processing: ${file}`);

      try {
        // APIからエピソード一覧を取得
        const farPast = new Date('2000-01-01');
        const episodes = await getEpisodesByFeedId(podcastConfig.podcastIndexId, farPast);

        // 日付とタイトルでマッチング
        const targetDate = meta.date;
        const matchingEpisode = episodes.find((ep) => {
          const epDate = new Date(ep.pubDateMs).toISOString().split('T')[0];
          // 日付が一致し、タイトルが類似
          return epDate === targetDate && (
            ep.title === meta.title ||
            ep.title.includes(meta.title) ||
            meta.title.includes(ep.title) ||
            sanitizeFilename(ep.title) === sanitizeFilename(meta.title)
          );
        });

        if (!matchingEpisode) {
          console.log(`  Warning: No matching episode found for ${meta.title}`);
          errorCount++;
          continue;
        }

        console.log(`  Found episode ID: ${matchingEpisode.id}`);

        // ファイル内容を更新（episode_id追加）
        const content = fs.readFileSync(filePath, 'utf-8');
        const newContent = content.replace(
          /^---\n/,
          `---\nepisode_id: ${matchingEpisode.id}\n`
        );

        // 新しいファイル名を生成
        const newFileName = `${targetDate}-${matchingEpisode.id}-${sanitizeFilename(meta.title)}.md`;
        const newFilePath = path.join(podcastPath, newFileName);

        // ファイルを書き込み
        fs.writeFileSync(newFilePath, newContent);

        // 古いファイルを削除（ファイル名が異なる場合のみ）
        if (filePath !== newFilePath) {
          fs.unlinkSync(filePath);
          console.log(`  Renamed: ${file} -> ${newFileName}`);
        } else {
          console.log(`  Updated: ${file}`);
        }

        migratedCount++;
      } catch (e) {
        console.error(`  Error processing ${file}:`, e);
        errorCount++;
      }
    }
  }

  console.log(`\nMigration complete:`);
  console.log(`  Migrated: ${migratedCount}`);
  console.log(`  Skipped: ${skippedCount}`);
  console.log(`  Errors: ${errorCount}`);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
