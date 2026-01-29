/**
 * Google Docs 作成モジュール
 */

interface EpisodeInfo {
  title: string;
  podcastName: string;
  pubDate: Date;
  link: string;
  audioUrl: string;
}

interface CreatedDoc {
  title: string;
  url: string;
  docId: string;
}

/**
 * エピソード用のGoogle Docsを作成
 */
function createEpisodeDoc(
  episode: EpisodeInfo,
  transcript: string,
  summary400: string,
  summary2000: string
): CreatedDoc {
  const dateStr = Utilities.formatDate(episode.pubDate, 'Asia/Tokyo', 'yyyy-MM-dd');
  const docTitle = `[${episode.podcastName}] ${episode.title} - ${dateStr}`;

  const doc = DocumentApp.create(docTitle);
  const body = doc.getBody();

  // スタイル設定
  const headingStyle: GoogleAppsScript.Document.Attribute = DocumentApp.Attribute.HEADING;

  // エピソード情報セクション
  const infoHeading = body.appendParagraph('エピソード情報');
  infoHeading.setHeading(DocumentApp.ParagraphHeading.HEADING1);

  body.appendParagraph(`Podcast: ${episode.podcastName}`);
  body.appendParagraph(`タイトル: ${episode.title}`);
  body.appendParagraph(`公開日: ${dateStr}`);
  body.appendParagraph(`リンク: ${episode.link}`);
  body.appendParagraph('');

  // サマリ（400文字）セクション
  const summary400Heading = body.appendParagraph('サマリ（400文字）');
  summary400Heading.setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph(summary400);
  body.appendParagraph('');

  // サマリ（2000文字）セクション
  const summary2000Heading = body.appendParagraph('サマリ（2000文字）');
  summary2000Heading.setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph(summary2000);
  body.appendParagraph('');

  // 全文書き起こしセクション
  const transcriptHeading = body.appendParagraph('全文書き起こし');
  transcriptHeading.setHeading(DocumentApp.ParagraphHeading.HEADING1);

  // 長いテキストは段落ごとに分割して追加
  const paragraphs = transcript.split('\n\n');
  for (const para of paragraphs) {
    if (para.trim()) {
      body.appendParagraph(para.trim());
    }
  }

  doc.saveAndClose();

  return {
    title: docTitle,
    url: doc.getUrl(),
    docId: doc.getId(),
  };
}

/**
 * ドキュメントを特定のフォルダに移動
 * @param docId ドキュメントID
 * @param folderId フォルダID
 */
function moveDocToFolder(docId: string, folderId: string): void {
  const file = DriveApp.getFileById(docId);
  const folder = DriveApp.getFolderById(folderId);
  file.moveTo(folder);
}

/**
 * Podcast用のフォルダを取得または作成
 */
function getOrCreatePodcastFolder(podcastName: string): GoogleAppsScript.Drive.Folder {
  const rootFolderName = 'Podcast Summaries';

  // ルートフォルダを検索または作成
  let rootFolder: GoogleAppsScript.Drive.Folder;
  const rootFolders = DriveApp.getFoldersByName(rootFolderName);
  if (rootFolders.hasNext()) {
    rootFolder = rootFolders.next();
  } else {
    rootFolder = DriveApp.createFolder(rootFolderName);
  }

  // Podcast用サブフォルダを検索または作成
  const subFolders = rootFolder.getFoldersByName(podcastName);
  if (subFolders.hasNext()) {
    return subFolders.next();
  } else {
    return rootFolder.createFolder(podcastName);
  }
}
