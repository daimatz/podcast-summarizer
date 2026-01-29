/**
 * Claude API クライアント
 * https://docs.anthropic.com/claude/reference/messages_post
 */

const CLAUDE_BASE_URL = 'https://api.anthropic.com/v1';
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

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

/**
 * Claude APIにメッセージを送信
 */
function callClaude(systemPrompt: string, userMessage: string, maxTokens: number = 4096): string {
  const apiKey = getApiKeys().CLAUDE_KEY;
  if (!apiKey) {
    throw new Error('Claude API key is not configured');
  }

  const url = `${CLAUDE_BASE_URL}/messages`;

  const payload = {
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: userMessage,
      },
    ],
  };

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const responseCode = response.getResponseCode();
  if (responseCode !== 200) {
    throw new Error(`Claude API error: ${responseCode} - ${response.getContentText()}`);
  }

  const data = JSON.parse(response.getContentText()) as ClaudeResponse;
  return data.content[0].text;
}

/**
 * 文字起こしテキストを整形（句読点・改行追加）
 */
function formatTranscript(rawText: string): string {
  const systemPrompt = `あなたは日本語テキストの整形を行うアシスタントです。
音声認識で出力された生のテキストを、読みやすく整形してください。

ルール:
- 適切な位置に句読点（、。）を追加
- 段落の区切りで改行を追加
- 話者が変わったと思われる箇所で改行
- 内容は一切変更しない
- 追加の説明や前置きは不要。整形したテキストのみを出力`;

  return callClaude(systemPrompt, rawText, 8192);
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
