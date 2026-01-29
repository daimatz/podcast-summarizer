# Podcast Summarizer

Google Apps Script で動作する Podcast 要約ツール。新しいエピソードを自動でチェックし、音声を文字起こしして Claude で要約を生成し、Google Docs に保存します。

## 技術スタック

- **言語**: TypeScript + Clasp
- **音声認識**: Lemonfox.ai API
- **Podcast検索**: Listen Notes API
- **要約生成**: Claude API (Anthropic)
- **出力**: Google Docs
- **通知**: Gmail

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. Clasp ログイン

```bash
npx clasp login
```

### 3. Google Apps Script プロジェクト作成

新規作成の場合:
```bash
npx clasp create --title "Podcast Summarizer" --type standalone
```

既存のプロジェクトに接続する場合は、`.clasp.json` の `scriptId` を更新してください。

### 4. デプロイ

```bash
npm run push
```

### 5. API キーの設定

GAS エディタを開きます:
```bash
npm run open
```

`setApiKeysManual()` 関数内の値を編集して実行するか、プロジェクト設定 > スクリプトプロパティで以下を設定:

| プロパティ名 | 説明 |
|------------|------|
| `LISTEN_NOTES_KEY` | Listen Notes API キー |
| `LEMONFOX_KEY` | Lemonfox.ai API キー |
| `CLAUDE_KEY` | Claude API キー |
| `NOTIFICATION_EMAIL` | 通知先メールアドレス（省略時は実行ユーザーのメール） |

### 6. Podcast の登録

プロジェクト設定 > スクリプトプロパティで以下の形式で追加:

| プロパティ名 | 値 |
|------------|-----|
| `PODCAST_1` | Rebuild |
| `PODCAST_2` | backspace.fm |

`PODCAST_` の後ろは任意のキー、値が検索キーワード（Podcast 名）です。
Listen Notes の検索 API でこのキーワードを使ってエピソードを検索します。

### 7. トリガーの設定

GAS エディタで「トリガー」（時計アイコン）から手動で設定:
- 関数: `checkNewEpisodes`
- イベントソース: 時間主導型
- 時間ベースのトリガータイプ: 時間ベースのタイマー
- 間隔: 1時間おき（推奨）

## 使用方法

### 手動実行

GAS エディタで `checkNewEpisodes()` を実行。

### 設定確認

GAS エディタで `checkConfiguration()` を実行すると、現在の設定状態が確認できます。

### Podcast の追加/削除

スクリプトプロパティで `PODCAST_<id>` を追加/削除するだけです。

## ファイル構造

```
src/
├── main.ts        # メインエントリーポイント、トリガー設定
├── config.ts      # PropertiesService 管理
├── listenNotes.ts # Listen Notes API クライアント
├── lemonfox.ts    # Lemonfox.ai STT クライアント
├── claude.ts      # Claude API クライアント
├── docs.ts        # Google Docs 作成
└── mail.ts        # メール通知
```

## 生成されるドキュメント

各エピソードごとに以下の構成で Google Docs が作成されます:

1. **エピソード情報** - タイトル、公開日、リンク
2. **サマリ（400文字）** - 簡潔な要約
3. **サマリ（2000文字）** - 詳細な要約
4. **全文書き起こし** - 整形済みの文字起こし

ドキュメントは「Podcast Summaries」フォルダ内に Podcast ごとのサブフォルダで整理されます。

## 注意事項

- GAS の実行時間制限（6分）があるため、非常に長いエピソードは処理できない場合があります
- Lemonfox.ai の音声ファイルサイズ制限を確認してください
- API の利用料金が発生する場合があります

## ライセンス

MIT
