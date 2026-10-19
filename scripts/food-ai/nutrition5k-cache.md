# Nutrition5k のローカル画像キャッシュ

PCには収集中の画像を一時保管し、Driveへのアップロード後に全データを再ダウンロードしてSHA-256が一致した画像だけを退避できます。Driveを使っても、学習計算には必要な画像を再取得するPC/GPU環境が必要です。容量確保とモデル学習は別です。

## 操作

```sh
# 何も除去せず候補数・容量・未検証件数を確認
node scripts/food-ai/nutrition5k-cache.mjs

# 上の結果を確認した後に限り、検証済みPNGのローカルコピーを除去
node scripts/food-ai/nutrition5k-cache.mjs --apply

# 次の最大1,000枚 / 転送1GB。既にDriveへ退避した画像は再ダウンロードしない
node scripts/food-ai/collect-nutrition5k.mjs --max-new 1000 --max-bytes 1000000000
```

出力先が既定と違う場合、キャッシュ処理の `--data` と収集の `--output` に同じ専用フォルダを指定します。共有台帳を移動した場合は双方に `--archive DIR` を指定します。既定のDrive保存先IDとの一致も必須です。保存先やdatasetの違う台帳を流用してはいけません。

削除対象は `training-data/nutrition5k/images/nutrition5k-dish_<10桁>.png` のみです。画像と正解JSONが両方ともアップロード・完全再取得済みであり、ローカル画像のハッシュとサイズが正解JSON・台帳の両方に一致する必要があります。CSV・正解JSON・出典・公式split・Driveファイルは残します。転送用tarの片付けは別の `drive-archive.mjs cleanup` の対象です。

除去より前に `archive-cache-index.json` にDriveファイルID・バッチID・tarのSHA-256・画像のSHA-256・tar内のパスを永続化します。途中停止時に `eviction-pending` が残っていても、台帳と復元先が一致すれば再開可能です。画像が無いのに索引または完全再取得済み台帳が無い場合は停止します。台帳や索引を書き換えてこの確認を回避しないでください。

## Driveから戻す手順

1. `archive-cache-index.json` で対象 `imageFile` の `remoteId`、`archiveSha256`、`archiveBytes`、`archiveObjectPath`、画像の `sha256` / `bytes` を確認します。共有台帳 `ml/artifacts/drive-archive/state.json` の同じバッチと一致することも確認します。
2. 接続済みDriveから、その `remoteId` の非公開tarを新しい一時フォルダへダウンロードします。認証情報をソースコードやコマンド引数に貼らないでください。
3. ダウンロードしたtar全体のバイト数とSHA-256を台帳に照合します。違う場合は展開・復元せず停止します。完全再取得を省略してDriveの表示サイズだけで確認したことにしないでください。
4. tar内 `batch.json` の対象論理キー `nutrition5k/images/nutrition5k-dish_<10桁>.png`、SHA-256、`archivePath` を照合し、その `objects/<SHA-256>` という通常ファイルだけを一時フォルダに取り出します。tar全体をアプリのフォルダへ直接展開しないでください。絶対パス・`..`・リンクは拒否してください。
5. 取り出した画像単体もSHA-256とサイズを照合し、正解JSONの `imageSha256` と一致することを確認します。保存先フォルダにシンボリックリンクが無く、既存画像が無いことを確認して、対応する `images/...png` へ戻します。既存ファイルは上書きしません。
6. 索引・台帳は消さずに残します。収集を再実行すると、復元されたローカル画像のハッシュを確認して一覧へ戻します。索引の `evicted` は過去の退避履歴であり、存在する画像の削除命令ではありません。

このスクリプト自体はDriveへ接続せず、署名付きURLやトークンを保存しません。検証日時の記録は将来のDrive削除を検出する保証ではありません。Drive側の元tar、索引、台帳を維持してください。別のPCへの移行時は絶対パスを含む台帳・索引の安全な移行確認が必要で、自動的に別保存先を信頼しません。
