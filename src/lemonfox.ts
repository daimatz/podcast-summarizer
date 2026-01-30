import { getEnv } from './config.js';

const LEMONFOX_BASE_URL = 'https://api.lemonfox.ai/v1';

interface TranscriptionResponse {
  text: string;
}

async function transcribe(audioUrl: string): Promise<string> {
  const apiKey = getEnv('LEMONFOX_KEY');

  const response = await fetch(`${LEMONFOX_BASE_URL}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      file: audioUrl,
      language: 'ja',
      response_format: 'json',
    }),
  });

  if (!response.ok) {
    throw new Error(`Lemonfox API error: ${response.status} - ${await response.text()}`);
  }

  const data = (await response.json()) as TranscriptionResponse;
  return data.text;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function transcribeWithRetry(audioUrl: string, maxRetries: number = 3): Promise<string> {
  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await transcribe(audioUrl);
    } catch (e) {
      lastError = e as Error;
      console.log(`Transcription attempt ${i + 1} failed: ${lastError.message}`);
      await sleep(2000 * (i + 1));
    }
  }

  throw lastError || new Error('Transcription failed after all retries');
}
