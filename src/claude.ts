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

/**
 * Claude APIにメッセージを送信（リトライ機能付き）
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

  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
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
 * 文字起こしテキストを整形（話者分離・セクション分け）
 * JSON形式で返す
 */
function formatTranscript(rawText: string): FormattedTranscript {
  const systemPrompt = `あなたはPodcastの文字起こしを整形するアシスタントです。

以下のタスクを実行してください:

1. **話者分離**: 発言者を識別し、各発言の前に話者ラベルを付けてください
   - 会話の中で話者の実名が明確に言及されている場合のみ、その名前を使用
   - 名前が特定できない場合は役割で表記:
     - メインの進行役: 「ホスト:」
     - ゲスト1人の場合: 「ゲスト:」
     - ゲスト複数の場合: 「ゲストA:」「ゲストB:」
   - 重要: 名前を推測や創作しないでください。確実に特定できる場合のみ実名を使用

2. **セクション分け**: 話題の変わり目でセクションを区切り、各セクションにタイトルを付けてください
   - 1つのエピソードを5〜10個程度のセクションに分割
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

  const result = callClaude(systemPrompt, rawText, 16384);

  try {
    // JSON部分を抽出（前後に説明文がある場合に対応）
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('JSON not found in response');
    }
    const parsed = JSON.parse(jsonMatch[0]) as { sections: Section[] };

    // fullText を生成
    const fullText = parsed.sections
      .map(s => `## ${s.title}\n\n${s.content}`)
      .join('\n\n---\n\n');

    return {
      sections: parsed.sections,
      fullText: fullText,
    };
  } catch (e) {
    // JSONパースに失敗した場合はフォールバック
    Logger.log(`JSON parse error: ${(e as Error).message}`);
    return {
      sections: [{ title: '全文', content: result }],
      fullText: result,
    };
  }
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
