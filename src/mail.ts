/**
 * メール通知モジュール
 */

interface DocInfo {
  title: string;
  url: string;
}

/**
 * 作成したドキュメントのリンクをメール送信
 */
function sendNotification(docs: DocInfo[]): void {
  if (docs.length === 0) {
    Logger.log('No documents to notify');
    return;
  }

  const email = getNotificationEmail();
  if (!email) {
    Logger.log('Notification email is not configured');
    return;
  }

  const subject = `[Podcast Summarizer] ${docs.length}件の新しいエピソードが処理されました`;

  let body = '以下のエピソードの要約が作成されました:\n\n';

  for (const doc of docs) {
    body += `- ${doc.title}\n`;
    body += `   ${doc.url}\n\n`;
  }

  body += '---\n';
  body += 'This email was sent by Podcast Summarizer.\n';

  GmailApp.sendEmail(email, subject, body);
  Logger.log(`Notification sent to ${email}`);
}

/**
 * エラー通知を送信
 */
function sendErrorNotification(error: Error, context: string): void {
  const email = getNotificationEmail();
  if (!email) {
    Logger.log('Notification email is not configured');
    return;
  }

  const subject = '[Podcast Summarizer] エラーが発生しました';

  let body = `Podcast Summarizerでエラーが発生しました。\n\n`;
  body += `コンテキスト: ${context}\n`;
  body += `エラー: ${error.message}\n\n`;
  body += `スタックトレース:\n${error.stack || 'N/A'}\n`;
  body += '\n---\n';
  body += 'This email was sent by Podcast Summarizer.\n';

  GmailApp.sendEmail(email, subject, body);
  Logger.log(`Error notification sent to ${email}`);
}
