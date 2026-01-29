/**
 * Claude API クライアント
 * https://docs.anthropic.com/claude/reference/messages_post
 */

const CLAUDE_BASE_URL = 'https://api.anthropic.com/v1';
const CLAUDE_MODEL = 'claude-sonnet-4-5-20250929';

interface ClaudeResponse {
  id: string;
  content: Array<{
    type: 'text';
    text: string;
  }>;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface Section {
  title: string;
  content: string;
}

interface FormattedTranscript {
  sections: Section[];
  fullText: string;
}

interface ClaudeRequest {
  systemPrompt: string;
  userMessage: string;
  maxTokens: number;
}

/**
 * Claude APIリクエストのオプションを生成
 */
function buildClaudeRequestOptions(apiKey: string, systemPrompt: string, userMessage: string, maxTokens: number): GoogleAppsScript.URL_Fetch.URLFetchRequestOptions {
  return {
    method: 'post',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    payload: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
    muteHttpExceptions: true,
  };
}

/**
 * Claude APIにメッセージを送信（リトライ機能付き）
 */
function callClaude(systemPrompt: string, userMessage: string, maxTokens: number = 4096): string {
  const apiKey = getApiKeys().CLAUDE_KEY;
  if (!apiKey) {
    throw new Error('Claude API key is not configured');
  }

  const url = `${CLAUDE_BASE_URL}/messages`;
  const options = buildClaudeRequestOptions(apiKey, systemPrompt, userMessage, maxTokens);

  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = UrlFetchApp.fetch(url, options);

      const responseCode = response.getResponseCode();
      if (responseCode === 200) {
        const data = JSON.parse(response.getContentText()) as ClaudeResponse;
        return data.content[0].text;
      }

      // 4xx エラーはリトライしない（クライアントエラー）
      if (responseCode >= 400 && responseCode < 500 && responseCode !== 429) {
        throw new Error(`Claude API error: ${responseCode} - ${response.getContentText()}`);
      }

      // 5xx または 429 はリトライ
      lastError = new Error(`Claude API error: ${responseCode} - ${response.getContentText()}`);
      Logger.log(`Claude API attempt ${attempt} failed: ${lastError.message}`);

    } catch (e) {
      lastError = e as Error;
      Logger.log(`Claude API attempt ${attempt} failed: ${lastError.message}`);
    }

    if (attempt < maxRetries) {
      // 指数バックオフで待機
      const waitTime = Math.pow(2, attempt) * 1000;
      Logger.log(`Waiting ${waitTime}ms before retry...`);
      Utilities.sleep(waitTime);
    }
  }

  throw lastError || new Error('Claude API call failed after all retries');
}

/**
 * 複数のClaude APIリクエストを並列実行
 */
function callClaudeParallel(requests: ClaudeRequest[]): string[] {
  const apiKey = getApiKeys().CLAUDE_KEY;
  if (!apiKey) {
    throw new Error('Claude API key is not configured');
  }

  const url = `${CLAUDE_BASE_URL}/messages`;

  const fetchRequests = requests.map(req => ({
    url: url,
    ...buildClaudeRequestOptions(apiKey, req.systemPrompt, req.userMessage, req.maxTokens),
  }));

  Logger.log(`Sending ${requests.length} parallel requests to Claude API...`);
  const responses = UrlFetchApp.fetchAll(fetchRequests);

  return responses.map((response, index) => {
    const responseCode = response.getResponseCode();
    if (responseCode !== 200) {
      throw new Error(`Claude API error for request ${index + 1}: ${responseCode} - ${response.getContentText()}`);
    }
    const data = JSON.parse(response.getContentText()) as ClaudeResponse;
    return data.content[0].text;
  });
}

const FORMAT_CHUNK_THRESHOLD = 12000;

/**
 * テキストを文の境界（句点）で分割
 */
function findSentenceBoundary(text: string, targetPosition: number): number {
  // 目標位置より後ろで最初の句点を探す
  for (let i = targetPosition; i < Math.min(text.length, targetPosition + 500); i++) {
    if (text[i] === '。' || text[i] === '.' || text[i] === '\n') {
      return i + 1;
    }
  }
  // 見つからなければ目標位置をそのまま返す
  return targetPosition;
}

/**
 * 整形用のシステムプロンプトを生成
 */
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

/**
 * Claude APIの結果をパースしてセクションを抽出
 */
function parseFormatResult(result: string): { sections: Section[] } {
  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('JSON not found in response');
    }
    return JSON.parse(jsonMatch[0]) as { sections: Section[] };
  } catch (e) {
    Logger.log(`JSON parse error: ${(e as Error).message}`);
    return { sections: [{ title: '（整形エラー）', content: result }] };
  }
}

/**
 * 単一チャンクを整形処理
 */
function formatTranscriptChunk(rawText: string, partInfo: string = ''): { sections: Section[] } {
  const result = callClaude(buildFormatSystemPrompt(partInfo), rawText, 16384);
  return parseFormatResult(result);
}

/**
 * テキストを閾値に基づいてチャンクに分割（オーバーラップなし）
 */
function splitTextIntoChunks(text: string): string[] {
  if (text.length <= FORMAT_CHUNK_THRESHOLD) {
    return [text];
  }

  const chunks: string[] = [];
  const numChunks = Math.ceil(text.length / FORMAT_CHUNK_THRESHOLD);
  const chunkSize = Math.ceil(text.length / numChunks);

  Logger.log(`Splitting ${text.length} chars into ${numChunks} chunks (target size: ${chunkSize})`);

  let currentPos = 0;
  for (let i = 0; i < numChunks; i++) {
    const endTarget = currentPos + chunkSize;
    const end = i === numChunks - 1 ? text.length : findSentenceBoundary(text, endTarget);

    chunks.push(text.slice(currentPos, end));
    Logger.log(`Chunk ${i + 1}: ${currentPos}-${end} (${end - currentPos} chars)`);
    currentPos = end;
  }

  return chunks;
}

/**
 * 文字起こしテキストを整形（話者分離・セクション分け）
 * 長いテキストは分割して並列処理
 */
function formatTranscript(rawText: string): FormattedTranscript {
  const chunks = splitTextIntoChunks(rawText);

  if (chunks.length === 1) {
    Logger.log(`Processing as single chunk (${rawText.length} chars)`);
    const parsed = formatTranscriptChunk(rawText);
    const fullText = parsed.sections
      .map(s => `## ${s.title}\n\n${s.content}`)
      .join('\n\n---\n\n');
    return { sections: parsed.sections, fullText };
  }

  // 複数チャンクは並列処理
  Logger.log(`Processing ${chunks.length} chunks in parallel...`);

  const requests: ClaudeRequest[] = chunks.map((chunk, i) => ({
    systemPrompt: buildFormatSystemPrompt(`これはPodcastの${i + 1}/${chunks.length}パート目です。`),
    userMessage: chunk,
    maxTokens: 16384,
  }));

  const results = callClaudeParallel(requests);

  const allSections: Section[] = [];
  for (let i = 0; i < results.length; i++) {
    const parsed = parseFormatResult(results[i]);
    Logger.log(`Chunk ${i + 1}: ${parsed.sections.length} sections`);
    allSections.push(...parsed.sections);
  }

  const fullText = allSections
    .map(s => `## ${s.title}\n\n${s.content}`)
    .join('\n\n---\n\n');

  Logger.log(`Combined: ${allSections.length} sections total`);

  return { sections: allSections, fullText };
}

/**
 * テキストを要約
 * @param text 要約対象のテキスト
 * @param maxChars 目標文字数
 */
function summarize(text: string, maxChars: number): string {
  const systemPrompt = `あなたはPodcastの内容を要約するアシスタントです。

ルール:
- ${maxChars}文字程度で要約してください
- 主要なトピックと結論を含める
- 話者の名前が分かる場合は「〇〇さんは〜と述べた」のように言及してもよい
- 箇条書きは使わず、自然な文章で書く
- 追加の説明や前置きは不要。要約のみを出力`;

  return callClaude(systemPrompt, `以下のPodcastの内容を要約してください:\n\n${text}`, Math.ceil(maxChars * 1.5));
}

/**
 * 400文字のサマリを生成
 */
function summarize400(text: string): string {
  return summarize(text, 400);
}

/**
 * 2000文字のサマリを生成
 */
function summarize2000(text: string): string {
  return summarize(text, 2000);
}
