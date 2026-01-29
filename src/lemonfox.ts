/**
 * Lemonfox.ai Speech-to-Text API クライアント
 * https://lemonfox.ai/docs
 */

const LEMONFOX_BASE_URL = 'https://api.lemonfox.ai/v1';

interface TranscriptionResponse {
  text: string;
}

/**
 * 音声URLから文字起こしを実行
 * @param audioUrl 音声ファイルのURL
 * @returns 文字起こしテキスト
 */
function transcribe(audioUrl: string): string {
  const apiKey = getApiKeys().LEMONFOX_KEY;
  if (!apiKey) {
    throw new Error('Lemonfox API key is not configured');
  }

  const url = `${LEMONFOX_BASE_URL}/audio/transcriptions`;

  const payload = {
    file: audioUrl,
    language: 'ja',
    response_format: 'json',
  };

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const responseCode = response.getResponseCode();
  if (responseCode !== 200) {
    throw new Error(`Lemonfox API error: ${responseCode} - ${response.getContentText()}`);
  }

  const data = JSON.parse(response.getContentText()) as TranscriptionResponse;
  return data.text;
}

/**
 * 長い音声の場合、チャンクに分割して処理する（将来の拡張用）
 * GASの6分制限があるため、非常に長い音声は処理できない可能性がある
 */
function transcribeWithRetry(audioUrl: string, maxRetries: number = 3): string {
  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return transcribe(audioUrl);
    } catch (e) {
      lastError = e as Error;
      Logger.log(`Transcription attempt ${i + 1} failed: ${lastError.message}`);
      // 少し待ってからリトライ
      Utilities.sleep(2000 * (i + 1));
    }
  }

  throw lastError || new Error('Transcription failed after all retries');
}
