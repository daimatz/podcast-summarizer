# Podcast Summarizer

GitHub Actions で動作する Podcast 要約ツール。新しいエピソードを自動でチェックし、音声を文字起こしして Claude で要約を生成します。

## 技術スタック

- **言語**: TypeScript (Node.js)
- **実行環境**: GitHub Actions
- **Podcast検索**: Podcast Index API
- **音声認識**: Lemonfox.ai API
- **要約生成**: Claude API (Anthropic)
- **出力**: Markdown (リポジトリに保存)
- **通知**: Email (Gmail)

## セットアップ

### 1. Private リポジトリとして使う（推奨）

購読リストや要約データを非公開にしたい場合、Private リポジトリを作成して upstream として本リポジトリを設定します。

```bash
# 本リポジトリを clone
git clone https://github.com/daimatz/podcast-summarizer.git my-podcast-data
cd my-podcast-data

# GitHub で private リポジトリを作成後、remote を設定
git remote rename origin upstream
git remote add origin git@github.com:YOUR_USERNAME/my-podcast-data.git

# private リポジトリに push
git push -u origin main

# 依存関係をインストール
npm install
```

#### upstream の更新を取り込む

本リポジトリが更新されたとき:

```bash
git fetch upstream
git merge upstream/main
git push origin main
```

`config/podcast-index.yaml` や `state/` でコンフリクトが発生した場合は、自分の変更を優先:

```bash
git checkout --ours config/podcast-index.yaml
git checkout --ours state/last-checked.json
git add .
git commit
```

### 2. GitHub Secrets の設定

リポジトリの Settings → Secrets and variables → Actions で以下を設定:

| Secret名 | 説明 |
|----------|------|
| `PI_API_KEY` | Podcast Index API キー |
| `PI_API_SECRET` | Podcast Index API シークレット |
| `LEMONFOX_KEY` | Lemonfox.ai API キー |
| `CLAUDE_KEY` | Claude API キー |
| `EMAIL_USER` | Gmail アドレス（通知用） |
| `EMAIL_PASS` | Gmail アプリパスワード |
| `NOTIFICATION_EMAIL` | 通知先メールアドレス |

### 3. Podcast の登録

`config/podcast-index.yaml` を編集:

```yaml
podcasts:
  - name: Rebuild
    id: 316425
  - name: backspace.fm
    id: 123456
```

`id` は Podcast Index の Feed ID です。以下で検索できます:
```bash
curl "https://api.podcastindex.org/api/1.0/search/byterm?q=Rebuild" \
  -H "X-Auth-Key: ${PI_API_KEY}" \
  -H "X-Auth-Date: ${AUTH_DATE}" \
  -H "Authorization: ${AUTH_HASH}"
```

### 4. 手動実行でテスト

Actions タブ → Podcast Summarizer → Run workflow

## 過去エピソードのインポート

登録済みの Podcast から過去のエピソードをインポートできます。

1. Actions タブ → **Import Past Episodes** → Run workflow
2. 以下を入力:
   - `id`: Podcast Index ID（config に登録済みのもの）
   - `last`: インポートする件数（デフォルト: 5）
3. Run workflow をクリック

既にインポート済みのエピソードは自動的にスキップされます。

## ローカル実行

```bash
export PI_API_KEY=...
export PI_API_SECRET=...
export LEMONFOX_KEY=...
export CLAUDE_KEY=...
npm run dev
```

## 移行スクリプト

### エピソードIDをファイル名に追加

既存のエピソードファイルにエピソードIDを追加する移行:

```bash
npm run migrate:add-episode-id
```

## ファイル構成

```
podcast-summarizer/
├── .github/workflows/
│   ├── summarize.yml         # 定期実行ワークフロー
│   └── import.yml            # 過去エピソードインポート
├── src/
│   ├── index.ts              # エントリーポイント
│   ├── import.ts             # 過去エピソードインポート
│   ├── migrate-add-episode-id.ts  # 移行スクリプト
│   ├── config.ts             # 設定管理
│   ├── podcastIndex.ts       # Podcast Index API
│   ├── lemonfox.ts           # 音声文字起こし
│   ├── claude.ts             # Claude API（整形・要約）
│   └── markdown.ts           # Markdown 生成
├── config/
│   └── podcast-index.yaml    # 購読 Podcast リスト
├── state/
│   └── last-checked.json     # 最終確認日時
└── episodes/                 # 生成された要約
```

## 生成されるドキュメント

各エピソードごとに以下の構成で Markdown が作成されます:

1. **エピソード情報** - タイトル、公開日、リンク
2. **サマリ（400文字）** - 簡潔な要約
3. **サマリ（2000文字）** - 詳細な要約
4. **全文書き起こし** - 話者分離・セクション分けされた文字起こし

ファイル名形式: `{date}-{episodeId}-{title}.md`

## スケジュール

毎日 07:00 と 19:00 JST に実行されます。
`.github/workflows/summarize.yml` の cron 設定で変更可能。

## 注意事項

- API の利用料金が発生する場合があります
- 長時間のエピソードは処理に時間がかかります

## ライセンス

MIT
