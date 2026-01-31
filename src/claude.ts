import { getEnv } from './config.js';
import { Agent, fetch as undiciFetch } from 'undici';

const agent = new Agent({
  headersTimeout: 900000, // 15分
  bodyTimeout: 900000,    // 15分
  connectTimeout: 60000,  // 1分
});

const CLAUDE_BASE_URL = 'https://api.anthropic.com/v1';
const CLAUDE_MODEL = 'claude-sonnet-4-5-20250929';

interface ClaudeResponse {
  id: string;
  content: Array<{ type: 'text'; text: string }>;
  usage: { input_tokens: number; output_tokens: number };
}

interface Section {
  title: string;
  content: string;
}

export interface FormattedTranscript {
  sections: Section[];
  fullText: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callClaude(systemPrompt: string, userMessage: string, maxTokens: number = 4096): Promise<string> {
  const apiKey = getEnv('CLAUDE_KEY');

  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 900000); // 15分タイムアウト

      const response = await undiciFetch(`${CLAUDE_BASE_URL}/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        }),
        signal: controller.signal,
        dispatcher: agent,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = (await response.json()) as ClaudeResponse;
        return data.content[0].text;
      }

      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        throw new Error(`Claude API error: ${response.status} - ${await response.text()}`);
      }

      lastError = new Error(`Claude API error: ${response.status} - ${await response.text()}`);
      console.log(`Claude API attempt ${attempt} failed: ${lastError.message}`);
    } catch (e) {
      lastError = e as Error;
      console.log(`Claude API attempt ${attempt} failed: ${lastError.message}`);
      if ((e as any).cause) {
        console.log(`Error cause:`, (e as any).cause);
      }
    }

    if (attempt < maxRetries) {
      const waitTime = Math.pow(2, attempt) * 1000;
      console.log(`Waiting ${waitTime}ms before retry...`);
      await sleep(waitTime);
    }
  }

  throw lastError || new Error('Claude API call failed after all retries');
}

const FORMAT_CHUNK_THRESHOLD = 12000;

function findSentenceBoundary(text: string, targetPosition: number): number {
  for (let i = targetPosition; i < Math.min(text.length, targetPosition + 500); i++) {
    if (text[i] === '。' || text[i] === '.' || text[i] === '\n') {
      return i + 1;
    }
  }
  return targetPosition;
}

function buildFormatSystemPrompt(partInfo: string = ''): string {
  return `あなたはPodcastの文字起こしを整形するアシスタントです。
${partInfo}
以下のタスクを実行してください:

1. **話者分離**: 発言者を識別し、各発言の前に話者ラベルを付けてください
   - 会話の中で話者の実名が明確に言及されている場合のみ、その名前を使用
   - 名前が特定できない場合は役割で表記:
     - メインの進行役: 「ホスト:」
     - ゲスト1人の場合: 「ゲスト:」
     - ゲスト複数の場合: 「ゲストA:」「ゲストB:」
   - 重要: 名前を推測や創作しないでください。確実に特定できる場合のみ実名を使用

2. **セクション分け**: 話題の変わり目でセクションを区切り、各セクションにタイトルを付けてください
   - この部分を3〜6個程度のセクションに分割
   - セクションタイトルは内容を端的に表す日本語で

3. **整形**: 読みやすい日本語の文章に整形してください
   - 必ず適切な位置に句点（。）と読点（、）を追加
   - 文の終わりには必ず句点を付ける
   - 長い文は適切に区切り、読点を入れる
   - 段落の区切りで改行を追加

以下のJSON形式で出力してください（他の文章は不要）:
{
  "sections": [
    {
      "title": "セクションタイトル",
      "content": "ホスト: 発言内容...\\n\\nゲスト: 発言内容..."
    }
  ]
}`;
}

function parseFormatResult(result: string): { sections: Section[] } {
  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('JSON not found in response');
    }
    return JSON.parse(jsonMatch[0]) as { sections: Section[] };
  } catch (e) {
    console.log(`JSON parse error: ${(e as Error).message}`);
    return { sections: [{ title: '（整形エラー）', content: result }] };
  }
}

function splitTextIntoChunks(text: string): string[] {
  if (text.length <= FORMAT_CHUNK_THRESHOLD) {
    return [text];
  }

  const chunks: string[] = [];
  const numChunks = Math.ceil(text.length / FORMAT_CHUNK_THRESHOLD);
  const chunkSize = Math.ceil(text.length / numChunks);

  console.log(`Splitting ${text.length} chars into ${numChunks} chunks (target size: ${chunkSize})`);

  let currentPos = 0;
  for (let i = 0; i < numChunks; i++) {
    const endTarget = currentPos + chunkSize;
    const end = i === numChunks - 1 ? text.length : findSentenceBoundary(text, endTarget);

    chunks.push(text.slice(currentPos, end));
    console.log(`Chunk ${i + 1}: ${currentPos}-${end} (${end - currentPos} chars)`);
    currentPos = end;
  }

  return chunks;
}

export async function formatTranscript(rawText: string): Promise<FormattedTranscript> {
  const chunks = splitTextIntoChunks(rawText);

  if (chunks.length === 1) {
    console.log(`Processing as single chunk (${rawText.length} chars)`);
    const result = await callClaude(buildFormatSystemPrompt(), rawText, 16384);
    const parsed = parseFormatResult(result);
    const fullText = parsed.sections.map((s) => `## ${s.title}\n\n${s.content}`).join('\n\n---\n\n');
    return { sections: parsed.sections, fullText };
  }

  console.log(`Processing ${chunks.length} chunks sequentially...`);

  const allSections: Section[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const partInfo = `これはPodcastの${i + 1}/${chunks.length}パート目です。`;
    const result = await callClaude(buildFormatSystemPrompt(partInfo), chunks[i], 16384);
    const parsed = parseFormatResult(result);
    console.log(`Chunk ${i + 1}: ${parsed.sections.length} sections`);
    allSections.push(...parsed.sections);
  }

  const fullText = allSections.map((s) => `## ${s.title}\n\n${s.content}`).join('\n\n---\n\n');

  console.log(`Combined: ${allSections.length} sections total`);

  return { sections: allSections, fullText };
}

async function summarize(text: string, maxChars: number): Promise<string> {
  const systemPrompt = `あなたはPodcastの内容を要約するアシスタントです。

ルール:
- ${maxChars}文字程度で要約してください
- 主要なトピックと結論を含める
- 話者の名前が分かる場合は「〇〇さんは〜と述べた」のように言及してもよい
- 箇条書きは使わず、自然な文章で書く
- 追加の説明や前置きは不要。要約のみを出力`;

  return callClaude(systemPrompt, `以下のPodcastの内容を要約してください:\n\n${text}`, Math.ceil(maxChars * 1.5));
}

export async function summarize400(text: string): Promise<string> {
  return summarize(text, 400);
}

export async function summarize2000(text: string): Promise<string> {
  return summarize(text, 2000);
}
