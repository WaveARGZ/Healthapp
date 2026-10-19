# 公開学習データのDrive保管

`drive-archive.mjs` は公開データだけを差分tarにまとめるローカル準備ツールです。アップロード機能・Google認証情報・個人の食事写真へのアクセスは持ちません。Driveコネクタによる実アップロードと照合を別工程で行います。アーカイブを作っただけでDriveに保存されたとは報告しないでください。

保存先はユーザーの `foodDB` 内の専用フォルダ `1-43fJG6gRjTVX0FPSi4_-sfRsSmP-hJT`。この台帳で管理する全データセットを合算し、**保存済みと未アップロード予約の合計4,000,000,000,000 bytes** を上限にします。他のDriveファイルは台帳の対象外なので、アップロード前にDriveの実際の空き容量も確認してください。上限は保存義務・学習量の目標ではありません。

## 準備

```bash
node scripts/food-ai/drive-archive.mjs prepare
```

- 入力既定値：`training-data/commons/`
- 出力：`ml/artifacts/drive-archive/`（Git対象外）
- `queue.json`：待機バッチ、保存先ID、絶対ファイルパス、サイズ、SHA-256、MD5
- `state.json`：差分と容量予約、アップロードの受領記録。削除・再作成しないでください。
- 1バッチ最大100MB、1回最大3バッチ。`--max-batches 10` などで変更可能（最大100）。
- ローカルの空き容量5GBを維持します。確認済みの画像・古いバッチも自動削除しません。PCの空き容量が下限に達したら停止します。
- 同時実行はロックで防止。元画像とJSONのSHA-256を確認し、作成途中の変更も検知します。

1つのtarには `batch.json` と `objects/<SHA-256>` が入ります。元の論理ファイル名・サイズ・SHA-256は `batch.json` に記録します。Commonsでは写真、正解/目視確認JSON、ファイルごとの作者・出典・ライセンスをそれぞれ保管します。**未確認の候補ラベルは未確認のまま**です。正解の修正だけなら画像を再転送せず、JSONの差分だけを次のバッチへ追加します。以前と同じ画像・メタデータは再準備しません。

Commonsの出典やCC BY作者表記が欠落する旧データは `queue.json` の `excluded` に理由を残し、Drive向けアーカイブから除外します。元データは消しません。取得当時のライセンス表記・URLを保持し、既知のCreative Commonsライセンスには正規URLを `archiveLicenseReference` として追記します。

## 実アップロードと受領記録

1. `queue.json` の `pending` を読みます。
2. Driveコネクタで同じ名前のファイルが既に存在するか確認します。再実行時には重複アップロードせず、既存ファイルをサイズ/MD5で照合してください。
3. 未保存ファイルだけを指定フォルダへアップロードします。既存Driveファイルを上書き・削除しません。
4. **Driveから取得したメタデータ**で、ID・名前・親フォルダ・size・md5Checksum・ゴミ箱にないことを確認します。ローカル値をそのまま転記して「確認済み」としないでください。
5. 実際の照合結果を以下のJSON形式で `ml/artifacts/drive-archive/receipts/` などへ保存します。

```json
{
  "batchId": "queue.jsonのid",
  "remoteId": "Driveから取得したファイルID",
  "folderId": "1-43fJG6gRjTVX0FPSi4_-sfRsSmP-hJT",
  "name": "Driveから取得したファイル名",
  "size": 123456,
  "md5Checksum": "Driveから取得した32文字MD5",
  "trashed": false,
  "verifiedBy": "drive-connector",
  "verifiedAt": "照合した時刻のISO文字列"
}
```

```bash
node scripts/food-ai/drive-archive.mjs receipt --receipt /絶対パス/receipt.json
```

受領記録は24時間以内の確認結果のみ受け付けます。ファイル名・サイズ・MD5が一致し、元tarのSHA-256も変化していない場合だけ台帳を `uploaded` に変更します。同一受領記録の再実行は何も追加しません。異なるDrive IDで既存受領記録を置換できません。CLIはリモートへ接続しないため、`verifiedBy` は確認者による証跡宣言であり独立したリモート検証の代わりにはなりません。

### コネクタがMD5を返さない場合

名前・ID・親フォルダ・sizeは引き続きDrive側で確認します。そのうえで、**アップロードしたDriveファイルをコネクタ経由で実際にダウンロード**し、元アーカイブとは別のローカルファイルとして保存してください。受領JSONから `md5Checksum` を省き、`"verificationMethod": "download-sha256"` を追加します。正規化されたコネクタが `trashed` を返さない場合、この方式のみ未確認のまま省略できます。推測で `false` を記入しないでください。`trashed: true` は拒否します。

同じ受領JSONの `remoteMetadata` に、コネクタが実際に返したメタデータをそのまま保存してください。少なくとも `id`、`title`、`size`、`parent_ids` が必要で、受領のID・名前・サイズ・フォルダと一致することを検査します。`shared` など他の返却フィールドもそのまま保持できます。

```json
{
  "remoteMetadata": {
    "id": "Driveが返したファイルID",
    "title": "Driveが返したファイル名.tar",
    "size": "123456",
    "parent_ids": ["1-43fJG6gRjTVX0FPSi4_-sfRsSmP-hJT"],
    "shared": false
  }
}
```

これは証跡の形の例であり、値は実際の返却値を使用します。`trashed` が省略された受領は、ゴミ箱状態まで検証したという意味ではありません。

```bash
node scripts/food-ai/drive-archive.mjs receipt --receipt /絶対パス/receipt.json \
  --downloaded-file /絶対パス/Driveからダウンロードしたファイル.tar
```

CLIがダウンロード済みの全バイトからSHA-256を再計算し、元tarと一致した場合だけ受領を記録します。単にハッシュ文字列を渡すだけでは受理しません。元tar自身・ハードリンク・シンボリックリンクは拒否します。ダウンロード先にはシンボリックリンクを含まない実パスを指定してください（macOSの `/tmp` は `/private/tmp` のような実パスが必要）。ただしCLIだけでは別ファイルが本当にDriveから来たか判別できないため、ローカルコピーで代用せず、確認者が実ダウンロードの出所を担保してください。

## 別の公開データセット

権利・商用利用条件を一次資料で確認したデータセットのみを追加してください。汎用入力のライセンス文字列は存在確認であり、利用権の自動判定ではありません。

入力dirに次の `archive-source.json` を置き、公開データのファイルだけ明示列挙します。元写真に関連する正解CSV、分割リスト、出典・ライセンス文書も含めてください。絶対パス、`..`、シンボリックリンクは禁止です。リスト外のファイルは取得しません。`archive-source.json` 自体は自動収録します。

```json
{
  "schemaVersion": 1,
  "dataset": "nutrition5k",
  "publicSource": {
    "url": "https://github.com/google-research-datasets/Nutrition5k",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/"
  },
  "files": ["images/example.png", "metadata.csv", "split.json"]
}
```

```bash
node scripts/food-ai/drive-archive.mjs prepare --dataset nutrition5k --data training-data/nutrition5k
```

**全データセットで同じ既定アーカイブdir/台帳を使用**します。別台帳に分けると4TBの合算管理ができません。食事利用者の本番データは混ぜません。

## 検証済みのローカル転送コピーを整理する

Driveへの実アップロードと受領確認が終わったら、PCの容量を重複コピーで消費し続けないよう整理できます。**既定は候補表示だけ**で、ファイルを消しません。

```bash
node scripts/food-ai/drive-archive.mjs cleanup
```

表示された正確な対象と容量を確認し、実際に整理する場合のみ次を使います。

```bash
node scripts/food-ai/drive-archive.mjs cleanup --apply
```

対象は同じ管理dir直下の `<検証済みbatchId>.tar` と `downloads/<同じbatchId>.tar` だけです。台帳が `uploaded` で、MD5またはダウンロードSHA-256の有効な受領証跡があるバッチに限定します。全候補のサイズとハッシュを検査してから削除し、各削除直前にも再確認します。未アップロード・未検証・ハッシュ不一致・シンボリックリンク・台帳外のファイルは消しません。再帰削除やDriveの変更は一切しません。

**残るもの**：学習元の写真・正解JSON・出典、`state.json`、受領記録、その他の学習ファイル、検証済みDriveアーカイブ。削除した転送コピーはDriveから再取得できます。台帳には `cleanedAt` とファイルごとの `localCleanup` を残し、Drive容量の使用済み計上は減らしません。次回の準備では保存済み内容を再アップロードしません。整理前にはDrive上の保存先が引き続き利用可能であることも確認してください。

## 復旧

準備中に停止しても容量予約は残ります。次の実行で完成tarが台帳のハッシュに一致すれば利用します。tar未完成なら同じ元データから再生成します。準備中の元ファイルが変わって再生成できない場合はエラーで停止し、既存画像や台帳を破棄しません。停止中バッチの元データの復元または状況確認が必要です。Drive上へ保存した直後に停止した場合は、既存ファイルを照合してから受領記録のみ再実行してください。
