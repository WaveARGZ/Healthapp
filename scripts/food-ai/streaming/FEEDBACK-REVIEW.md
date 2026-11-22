# 同意済みアプリ写真の独立確認

食事登録のカメラは、料理名・量・入力済みの栄養値だけを記録し、写真は破棄します。保存後の「写真認識の改善に協力する（任意）」から専用画面へ進めます。専用画面で写真を選び直し、Google認証・正解料理名の確認・明示的な共有同意を経て送信したデータだけが対象です。通常の食事履歴から写真を収集しません。共有テストでは送信しません。

`launcher.py` の人間向け確認画面と、`feedback_review.py` のCodex向け入口は、同じ安全な保存処理を使います。これらは既存の学習台帳を保持する所有者PC一台だけで実行します。新規cloneへ認証・非公開台帳をコピーせず、所有者状態チェックを無効化しません。

- 3003のbind-only mutexで学習処理・確認保存を直列化。1回に1画像、表示用は最大640px、原画像は最大5MBをRAMで扱います。
- foodDB配下の非公開な親階層、アプリ／公開素材の分離、明示同意・撤回・既存除外、元JSONの版と完全なSHA-256、画像の版と完全なSHA-256を再確認します。
- 元のJSON全体を非公開Driveのtraining_logsへ上書きしない別名で保存し、完全再取得照合してから、確認履歴を追記して受信JSONを更新・再取得照合します。元の料理名・AI候補・栄養値・同意・受付照合情報は保持します。
- 人間の画面操作は `human`、Codexの実際の目視は `visual-agent` / `Codex`。CLIの入力で確認者を人間へ変更できません。実際に画像を見てから、その観察内容をnotesへ記録します。
- アプリ投稿の正解が既存28分類の外なら保留を維持します。確認時に別の分類を選んでも受理しません。権利・正解・分割・互換性を別途検証して分類を追加するまで、近い料理へ置換しません。
- 公開素材は商用利用可能なライセンスと対応URL・帰属表示を既存の検証器で確認します。合成画像は対象外です。

## Codexによる確認

Python 3.12と固定済みのrequirementsを使います。以下の出力・標準入力はRAMでのみ扱い、リダイレクト・一時JSON・画像ダウンロード・ローカルのレビュー台帳を作りません。

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -B scripts/food-ai/streaming/feedback_review.py next
```

返された `image` はJPEGプレビューのbase64、`ticket` は元の版・SHA・保存先対応です。料理名やAI候補は独立確認のため表示しません。対象がない場合は `empty: true` を返します。分類外で保留中の件数は `outsideCatalogPending` です。

実画像を目視した後、返されたticketを変えず、`id`, `hash`, `foodId`, `decision`（accepted / rejected）, `notes` とともに、次のコマンドの標準入力へJSONとして渡します。

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -B scripts/food-ai/streaming/feedback_review.py review
```

保存・認証・整合性の失敗では追加処理を止めます。成功した確認を繰り返し送信しません。確認結果の保存は学習実行ではなく、応答の `trainingPerformed` はfalseです。

## 学習と評価

確認済みデータは既存のDrive専用 `pipeline.py` が読み取ります。投稿の不完全な候補スコアを流用せず、固定CLIPで512次元特徴と28候補の全スコアを再計算します。既存の出典・重複・分割・撤回履歴と、公開／アプリそれぞれの独立実写評価を維持します。データ不足や回帰時は補正器を採用しません。本番モデルは自動更新しません。保存件数・確認成功・特徴量抽出を精度改善と報告しません。

モック検証は `PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover -s scripts/food-ai/streaming -p 'test_*.py'`。写真登録のメモリ内検証は `npm run test:photo-submission`。実写真や本番送信をテストに使いません。
