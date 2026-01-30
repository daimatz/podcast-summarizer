# Podcast Summarizer

GitHub Actions で動作する Podcast 要約ツール。新しいエピソードを自動でチェックし、音声を文字起こしして Claude で要約を生成し、Markdown として GitHub Pages に公開します。

## 技術スタック

- **言語**: TypeScript (Node.js)
- **実行環境**: GitHub Actions
- **Podcast検索**: Podcast Index API
- **音声認識**: Lemonfox.ai API
- **要約生成**: Claude API (Anthropic)
- **出力**: Markdown (GitHub Pages)
- **通知**: Email (Gmail)

## セットアップ

### 1. リポジトリをフォーク/クローン

```bash
git clone https://github.com/your-username/podcast-summarizer.git
cd podcast-summarizer
npm install
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

`config/podcasts.yaml` を編集:

```yaml
podcasts:
  - name: Rebuild
    feedId: 316425
  - name: backspace.fm
    feedId: 123456
```

`feedId` は Podcast Index の Feed ID です。以下で検索できます:
```bash
curl "https://api.podcastindex.org/api/1.0/search/byterm?q=Rebuild" \
  -H "X-Auth-Key: ${PI_API_KEY}" \
  -H "X-Auth-Date: ${AUTH_DATE}" \
  -H "Authorization: ${AUTH_HASH}"
```

### 4. GitHub Pages の設定

Settings → Pages で:
- Source: Deploy from a branch
- Branch: main, /docs

### 5. 手動実行でテスト

Actions タブ → Podcast Summarizer → Run workflow

## ローカル実行

```bash
export PI_API_KEY=...
export PI_API_SECRET=...
export LEMONFOX_KEY=...
export CLAUDE_KEY=...
npm run dev
```

## ファイル構成

```
podcast-summarizer/
├── .github/workflows/
│   └── summarize.yml     # GitHub Actions ワークフロー
├── src/
│   ├── index.ts          # エントリーポイント
│   ├── config.ts         # 設定管理
│   ├── podcastIndex.ts   # Podcast Index API
│   ├── lemonfox.ts       # 音声文字起こし
│   ├── claude.ts         # Claude API（整形・要約）
│   └── markdown.ts       # Markdown 生成
├── config/
│   └── podcasts.yaml     # 購読 Podcast リスト
├── state/
│   └── last-checked.json # 最終確認日時
└── docs/                 # GitHub Pages 公開ディレクトリ
    ├── index.md
    └── episodes/
```

## 生成されるドキュメント

各エピソードごとに以下の構成で Markdown が作成されます:

1. **エピソード情報** - タイトル、公開日、リンク
2. **サマリ（400文字）** - 簡潔な要約
3. **サマリ（2000文字）** - 詳細な要約
4. **全文書き起こし** - 話者分離・セクション分けされた文字起こし

## スケジュール

デフォルトで毎日 15:00 JST (06:00 UTC) に実行されます。
`.github/workflows/summarize.yml` の cron 設定で変更可能。

## 注意事項

- API の利用料金が発生する場合があります
- 長時間のエピソードは処理に時間がかかります
- GitHub Pages は公開されるため、URL を知っている人はアクセス可能です

## ライセンス

MIT
