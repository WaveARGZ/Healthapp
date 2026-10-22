<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# BodyMake チーム共通ルール

- 最初に `README.md` の「チーム共通の始め方」を読む。共有コードの基準は `WaveARGZ/Healthapp` の `main`。チャット履歴や個人環境を共有済みと仮定しない。
- 作業前に現在のブランチ・差分・最新版との差を確認する。既存の変更は保持する。変更のない状態で `git pull --ff-only origin main` して、作業ごとに一意の `codex/担当者-作業名` ブランチを作る。未保存の変更を消すresetや強制pushはしない。
- 共有はPull Request経由。自動チェックと別メンバーのレビューを確認してマージし、`main` への直接pushを通常の作業手順にしない。push・マージはユーザーの依頼範囲で行う。
- Node.js 22.23.4（`.nvmrc`、最低22.13.0）、npm 10系、`npm ci` を使用する。画面確認は `npm run dev:test` の3001番。初期状態はデモ保存で、本番設定や学習共有先を有効にしない。`build:test` の前に同じテスト開発サーバーを停止する。
- 写真送信・学習コードの検証はREADME記載のRAM・モックテストを使う。Pythonは3.12、依存は `scripts/food-ai/streaming/requirements.txt` に固定する。旧 `npm run test:food-ai` の一括実行は学習用一時ファイルを生成するため行わない。
- `.env.local`、OAuth/ADC認証情報、秘密鍵、実利用者の写真・個人記録、`training-data/`、`ml/artifacts/` の台帳・確認履歴はGitへ追加しない。GitHubへの参加をGoogle/Drive/Firebaseへの権限付与と混同しない。
- 本番Firebase Hosting、Apps Script、Google権限、本番モデル、AWS、有料サービスは別の明示承認なしに変更・公開しない。GitHub Pagesも手動公開のみ。コード共有を本番デプロイの許可とみなさない。
- 実データの学習は所有者の検証済みPC一台に限定する。新規cloneで `owner_learning_state_missing` が出ても、空の履歴作成や認証・非公開台帳のコピーで迂回しない。3003のmutexは同一PC内だけで、複数PCの同時学習は防がない。
- 新しい学習画像・ラベル・レビュー・評価・モデル・台帳・アーカイブ・キャッシュをPCへ保存しない。既存のローカル学習ファイルは読み取りのみで削除・上書きしない。旧 `food-ai:agent` / `collect` / `collect:nutrition` / `review` / `review:apply` / `archive prepare` / `snapshot-learning` / `learn` は実行禁止。Drive専用方式の検証完了でも解除しない。
- 実写真の送信は本人の明示同意の範囲のみ。出典・同意・分割・除外履歴、非公開保存、EXIF除去、重複除外、再取得SHA-256照合を維持する。保存件数や特徴量抽出を認識精度向上と報告しない。公開素材とアプリ修正データを未検証で混ぜず、本番モデルは独立評価と別承認なしに更新しない。
