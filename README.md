# BodyMake

「理想の身体を、見える目標に。」をコンセプトにした、スマートフォンファーストの体づくり支援Webアプリです。筋トレ・食事・体重・身体写真を一つの流れで記録し、数字だけではない身体の変化を追えるMVPを実装しています。

## 実装済みの機能

- トップ、ログイン、新規登録、初期プロフィール設定画面
- ホームダッシュボード
  - 今日の日付・ユーザー名・現在体重・目標
  - 筋トレ / 食事 / 体重 / 身体写真の今日の記録状態
  - フィードバック、身体変化、週間記録のプレースホルダー
- 筋トレ記録
  - 種目ごとに重量・回数・完了状態をセット単位で記録
  - セット／種目の追加・削除、総ボリューム表示、履歴表示・削除
  - 胸・背中・肩・腕・脚・腹筋／体幹・有酸素から検索して種目を選択
- 食事記録
  - 朝食 / 昼食 / 夕食 / 間食を選択し、料理を複数追加
  - 料理別のカロリー・PFCと食事合計を記録
  - 写真を端末内の無料AIで解析し、料理候補と標準量ベースの栄養素を追加
  - 正解として確定した料理名・予測候補・写真を端末内に最大150件保存し、以後の候補順位に反映
  - 履歴表示・削除
- 体重記録と一覧
- 正面・背面の身体写真選択、プレビュー、端末内保存
- 体重推移と身体写真への導線を持つ進捗画面
- 5項目の下部固定ナビゲーション（ホーム / 筋トレ / 食事 / 進捗 / 設定）
- PWA化の土台となる `app/manifest.ts`

ログイン・新規登録は、現段階では画面遷移のみを行うUIです。

## ディレクトリ構成

```text
app/                    # App Routerのルート・ページ
components/
  auth/                 # ログイン・新規登録UI
  dashboard/            # ダッシュボード
  layout/               # アプリシェル・下部ナビ
  meals/ photos/ progress/ workouts/
  profile/ settings/ ui/ # ドメインUIと共通UI
hooks/                  # クライアント側の再利用フック
lib/
  api/                  # UIが依存する永続化インターフェースと合成ルート
  auth/                 # 将来のCognito連携用インターフェース
  storage/              # localStorage実装
  utils/                # 日付・IDのユーティリティ
types/                  # User / Workout / Meal / Progressの型定義
```

## 起動方法

Node.js と npm を用意して、プロジェクト直下で実行します。

```bash
npm install
npm run dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開いてください。

品質チェックは次で実行できます。

```bash
npm run lint
npm run build
```

この環境ではTurbopackがCSS処理の内部プロセス用ポートを開けないため、`npm run build` は Next.js 公式の `--webpack` オプションを使う設定にしています。アプリのルーティング・コンポーネント・型チェックを含めた本番ビルドは成功済みです。

## 保存方法とAWS移行

画面コンポーネントは `localStorage` を直接操作していません。すべて `lib/api/client.ts` の `bodyMakeClient` を経由し、現在は `lib/storage/local-bodymake-client.ts` が `BodyMakeClient` 契約を実装しています。

食事写真のAI候補だけは、`@huggingface/transformers` の公開ONNXモデルをブラウザ内で実行します。初回は約200MBのモデルをダウンロードしてブラウザキャッシュに保存しますが、料理写真を推論APIへ送信しません。正解データと写真は `lib/food-ai/food-learning.ts` からこの端末の IndexedDB へ保存されます。

このMVPの「学習」は、確定データに基づく個人向け候補順位の補正です。モデルの再学習（ファインチューニング）は端末内では行わず、収集したラベル付き写真をエクスポートして、将来ローカルPCまたはAWS上で学習する段階を想定しています。栄養素も現時点では標準量の目安なので、保存前に編集・確認してください。

AWS連携時に主に変更する箇所は次のとおりです。

| 現在 | AWS連携後 |
| --- | --- |
| `lib/storage/local-bodymake-client.ts` | API Gateway + Lambda のHTTPクライアント実装へ置換 |
| `lib/api/client.ts` | `LocalBodyMakeClient` ではなくAPIクライアントを注入 |
| `lib/auth/auth-client.ts` | Cognitoのサインアップ、ログイン、トークン更新、ログアウトを実装 |
| `BodyPhotoEntry.imageUrl` のData URL | S3のオブジェクトキー / CloudFront URLへ置換。署名付きURLでアップロード |
| 各エントリのローカル配列 | Lambda経由でDynamoDBへ保存・取得 |

`BodyMakeClient` と `types/` の型を維持すれば、フォームや表示コンポーネントの大半を変更せずに保存先をAWSへ移行できます。Bedrockによるフィードバックや評価機能は、APIクライアントに専用メソッドを追加してダッシュボードのプレースホルダーへ接続する想定です。
