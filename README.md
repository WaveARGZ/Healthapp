# BodyMake

「理想の身体を、見える目標に。」をコンセプトにした、スマートフォンファーストの体づくり支援Webアプリです。筋トレ・食事・体重・身体写真を一つの流れで記録し、数字だけではない身体の変化を追えるMVPを実装しています。

Firebase（Spark）版は `healthapp-14a3f` に接続し、Googleログイン・個人別Firestoreルール・静的サイトを公開しました。接続状態と残る検証は [FIREBASE-MIGRATION.md](./FIREBASE-MIGRATION.md) を参照してください。身体写真は端末内保存です。旧AWS環境は2026年10月11日に削除しました。旧記録のFirebaseへの自動移行は行っていません。

## 公開ビュー

Firebase版は [BodyMakeを開く](https://healthapp-14a3f.web.app/) から利用できます。ルートURLは `/bodymake/` に転送されます。ポートフォリオ画面は削除しました。従来の [GitHub Pages版](https://waveargz.github.io/Healthapp/) も残っていますが、この変更はGitHubへpushするまで反映されません。`main` ブランチへのpushは引き続きGitHub Pagesへデプロイするため、Firebase Hostingへの反映にはローカルでビルドと明示的なデプロイが必要です。

## テスト環境と本番環境

| 環境 | 起動・公開先 | 保存先 | 本番への反映 |
| --- | --- | --- | --- |
| ローカルテスト | `npm run dev:test` → `http://localhost:3001/bodymake` | 初期状態はこのブラウザ・ポート専用の端末内保存 | なし |
| Firebase公開版 | `https://healthapp-14a3f.web.app/` → `/bodymake/` | Googleログイン・ユーザー別Firestore。身体写真は端末内 | ローカルでビルド後、Firebase CLIで明示デプロイ |
| 旧GitHub Pages版 | `main` → GitHub Pagesの公開URL | 旧AWS接続先は削除済み（AWS未登録のビルドはデモ保存） | `main`へのpushでデプロイ |

`npm run dev:test` は画面に「テスト環境」と表示し、ビルド先も `.next-test` に分けるため、通常の開発サーバーと同時に起動できます。`localhost:3000` と `localhost:3001` はブラウザの保存領域が異なり、筋トレ・食事・写真・ログイン状態を共有しません。テスト環境は本番用の `NEXT_PUBLIC_BODYMAKE_*` 設定を読み取らず、AWSテスト用の設定がなければ端末内保存になります。学習データの送信先も初期状態では無効です。

AWSを使った結合テストをする場合は、**本番と別のAWSスタック**を用意してから、`.env.local` に `NEXT_PUBLIC_BODYMAKE_TEST_AUTH_DOMAIN`、`NEXT_PUBLIC_BODYMAKE_TEST_CLIENT_ID`、`NEXT_PUBLIC_BODYMAKE_TEST_API_URL` を設定します。必要なら `NEXT_PUBLIC_BODYMAKE_TEST_CALLBACK_URL`（初期値は `http://localhost:3001/auth/callback/`）、`NEXT_PUBLIC_BODYMAKE_TEST_LOGOUT_URL`、`NEXT_PUBLIC_BODYMAKE_TEST_GOOGLE_SIGN_IN_ENABLED` も設定します。テストのAPI URLまたはCognitoドメインが同じファイルの本番値と一致する場合、誤接続を避けるためAWS接続を有効にしません。テスト用スタックをまだ作成していないので、これらの値は現時点では空欄のままにしてください。別スタックはAWSリソースと費用が増える可能性があり、作成前に予算・停止設定を確認します。

`npm run build:test` はテスト設定の静的ビルドをローカルで検証します。テストの成果物は `.next-test/`、本番ビルドの静的書き出しは `out/` に分かれます。ただし、テスト開発サーバーとテストビルドは同じ `.next-test/` を使うため同時実行しないでください。現在、テスト環境の公開URLはありません。GitHub Pagesは1リポジトリにつき1つのサイトであり、公開テストサイトには別の公開先が必要です。本番URLと本番AWSにはこの設定だけで変更を加えません。

コードの確認は作業ブランチから `main` へPull Requestを作ると `verify-test.yml` がテスト設定でlint・ビルド・本番認証を継承しないこと・画面幅ロジックを検証します。合格を確認してから `main` にマージすると、既存の `deploy-pages.yml` が本番設定で公開します。直接 `main` にpushするとPull Requestの検証を経由しないため、本番公開前はPull Requestを利用してください。

## 実装済みの機能

- トップ、ログイン、新規登録、初期プロフィール・目標設定、任意の身体写真ステップ
- ホームダッシュボード
  - 今日の日付・ユーザー名・現在体重・目標
  - 筋トレ / 食事 / 体重の今日の記録状態。身体写真は任意の別導線
  - 過去7日間の実際の記録状況
  - 食事・筋トレの入力済み記録に基づく自動ふり返り（AIによる診断やフォーム判定ではない）
- 筋トレ記録
  - 種目ごとに重量・回数・完了状態をセット単位で記録
  - セット／種目の追加・削除、総ボリューム表示、履歴表示・削除
  - 胸・背中・肩・腕・脚・腹筋／体幹・有酸素から検索して種目を選択
  - プロフィールの目標を確認してから、週1〜7回・通う曜日・5分割／3分割／全身／曜日別の自由設定を保存。分割順は週をまたいで継続し、登録済みのお気に入り種目から予定の部位に合う候補を提案
- 食事記録
  - 朝食 / 昼食 / 夕食 / 間食を選択し、料理を複数追加
  - 料理別のカロリー・PFCと食事合計を記録
  - 日本で一般的な定番料理187件と、文部科学省「日本食品標準成分表（八訂）増補2023年」の日本語食品2,537件を検索し、食べた重さからPFCを計算。ひらがな・カタカナ、料理の別名、軽微な誤字にも対応
  - 写真を端末内の無料AIで解析し、料理候補と同じ食品データに基づく栄養素を追加
  - 認識後に正解料理名とカロリー・PFCを修正可能。写真・正解ラベルを端末内に最大150件保存
  - 学習データ共有は任意で毎回の明示同意が必要。デモ版はGoogleログイン後に共通Driveへ写真と正解を送信。AWS版は写真を含まない修正シグナルのみ学習用DynamoDBへ送信
  - 利用者の修正は付加データとして保存。登録回数だけで写真認識の順位は上げない
  - 公開画像の収集・目視確認キュー・学習・評価・実行履歴を持つ学習サイクル。合格時だけテスト環境の補正器を更新
  - 履歴表示・削除
- 体重記録と一覧
- 正面・背面の身体写真を任意で1枚から選択・撮影して保存。加工せず前回と最新を並べて表示
- 体重推移と身体写真への導線を持つ進捗画面
- スマホでは5項目の下部固定ナビ、PCでは左側ナビ（ホーム / 筋トレ / 食事 / 進捗 / 設定）
- オリジナルのアプリアイコンと、PWA化の土台となる `app/manifest.ts`

AWSの5つの公開設定値を入れたビルドではCognitoのHosted UI（認可コード + PKCE）を使用します。設定がないビルドは従来どおり**デモ版**です。デモログインは本人確認ではなく、データは端末内に保存されます。公開中のGitHub PagesにAWS設定がまだ入っていない場合もデモ版のままです。

## 画面デザイン

白地・細い罫線・日本語の見出しを基本にした「身体の記録帳」です。アクセントは深い緑に統一し、多色の装飾カード、大きな影、飾りの英語を使わず、実際の記録と操作を中心にしています。

- 指定のオリジナル画像を、ブラウザアイコンだけでなく全画面のBodyMakeロゴ横にも表示。静的importでGitHub Pagesのサブパスにも対応
- 共通の色・入力・見出しは `app/globals.css`、共通UIは `components/ui/` に集約
- 筋トレはセット表、食事は「検索・写真・手入力」の切り替え。切り替えても検索・写真の入力状態を維持
- 体重は測定日順の一覧と、目盛り・日付付きの折れ線グラフで表示
- 入力文字は基本16px、キーボード操作時のフォーカス表示、端末のセーフエリア、動きを抑える設定に対応
- デモ版の保存形式と保存キーは変更していないため、同じブラウザ・同じURLの既存データを継続利用可能。AWS版への自動移行は未実装

表示例はトップページ内で「記録のイメージ」と明記しています。ダッシュボードに架空の記録は表示しません。

### スマートフォン対応

同じ公開URLをスマホとPCで利用できます。ネイティブアプリではなく、画面幅に合わせて切り替わるWebアプリです。

- スマホ・タブレットでは下部5項目ナビ、幅1,024px以上では左側ナビ
- 筋トレ・食事・体重の保存ボタンを下部ナビの上に固定。保存結果も同じ場所に表示し、履歴の末尾が隠れない余白を確保
- 横向きの低い画面とソフトウェアキーボード表示中は保存ボタンをフォーム内へ戻す。キーボード表示中は下部ナビを隠して入力領域を確保
- `VisualViewport` の高さ・拡大率・入力フォーカスを使ってキーボードを判定。ピンチズームやブラウザのツールバー開閉だけでは入力中と判定しない
- スマホの種目選択は全画面。検索と閉じるボタンを上部に残し、種目一覧を縦スクロール。最初からキーボードは開かない
- ノッチ・ホームインジケーター・横持ちの左右のセーフエリアに対応。文字入力は16px、セットの削除や輪郭点のドラッグ範囲は44px以上。画面の拡大操作は制限しない

共通処理は `components/layout/mobile-viewport.tsx` と `components/ui/record-actions.tsx`、表示ルールは `app/globals.css` にあります。実機確認ではiPhone Safari・Android Chromeで、数値入力時のキーボード、縦横の回転、写真選択、ホーム画面から起動した際の画面端を確認してください。画面幅の検証とキーボード判定の単体テストは、実機OSの挙動の保証ではありません。

新規登録後はプロフィールと目標を設定し、そのままホームへ進みます。写真は初期設定では要求しません。希望する人だけ `/photos` で撮影・記録できます。既存の `/onboarding/photos` も直接開けば利用できますが、通常の登録動線からは外しています。設定画面からプロフィールを再編集したときもホームへ戻ります。

## 身体写真の記録

撮影距離・写真サイズ・背景によって輪郭推定と3パターンの変形結果が不自然になりやすかったため、利用画面から自動体型編集を外しました。初期写真ステップと `/photos` では端末の通常のカメラか写真ライブラリを使用し、どちらか1枚でも保存できます。撮影ガイドは任意の簡単なコツだけにし、全身を枠に合わせることは必須ではありません。

保存時は縦横比を保って縮小・圧縮しますが、身体の形は変えません。記録済みの同じ向きの写真が別の撮影日で2枚以上ある場合は、前回と最新を並べて表示します。既存の写真は削除・移行しません。Firebase版の身体写真は端末内に保存され、他の端末には同期されません。旧自動編集のコードは残していますが画面では使いません。

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
  auth/                 # デモ状態とCognito PKCEセッション
  cloud/                # 公開AWS設定
  drive/                # Googleアカウント認証と共通Drive受け口連携
  storage/              # localStorage実装
  photos/               # 写真の読み込み・Canvas編集
  data/                 # 日本語の定番食品の選定一覧と生成済みの栄養データ
  utils/                # 日付・IDのユーティリティ
types/                  # User / Workout / Meal / Progressの型定義
backend/                # AWS SAM、Lambda、DynamoDB/S3の検証
scripts/                # 公開データから食品ライブラリを再生成するスクリプト
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
npm run test:static-ui
npm run test:mobile-viewport
npm run validate:food-data
npm run test:food-catalog
npm run test:food-ai
npm run test:aws
cd backend && npm run test:guard
```

この環境ではTurbopackがCSS処理の内部プロセス用ポートを開けないため、`npm run build` は Next.js 公式の `--webpack` オプションを使う設定にしています。アプリのルーティング・コンポーネント・型チェックを含めた本番ビルドは成功済みです。

`test:static-ui` はビルド済みの12画面について、日本語設定、見出し、指定ロゴの実ファイル参照、下部／左ナビの5項目と選択状態を検証します。GitHub Pagesのパス確認は `GITHUB_ACTIONS=true GITHUB_REPOSITORY=WaveARGZ/Healthapp npm run build` の後に同じテストを実行します。ブラウザ上での操作・レイアウト検証の代替ではありません。

## 保存方法とAWS構成

通常記録は `lib/api/client.ts` の `bodyMakeClient` を経由します。AWS設定なしでは `lib/storage/local-bodymake-client.ts`、AWS設定ありでは `lib/api/aws-bodymake-client.ts` を利用します。ジム器具・お気に入りもAWS版では個人データベースに保存します。

`backend/template.yaml` は東京リージョン向けのAWS SAMテンプレートです。Cognitoユーザープール、JWT認証付きHTTP API、Lambda、個人記録用DynamoDB、学習シグナル専用DynamoDB、非公開の身体写真S3を構築します。LambdaはCognitoの`sub`から個人用パーティションを決め、リクエストの任意のユーザーIDを信用しません。S3の元写真も`users/<sub>/...`に保存します。学習シグナルは、明示同意後の料理名・栄養値と27分類の確率ベクトルだけを別テーブルへ保存し、写真・メールアドレスを保存しません。これは**学習素材の蓄積**であり、送信しただけでモデルが自動的に学習・更新される機能ではありません。

費用対策として、APIには2リクエスト/秒・バースト5のスロットリングを設定しています。別の監視Lambdaが6時間ごとにAWS Free Tier APIの当月使用量と予測使用量を確認し、いずれかの無料枠が80%以上になった場合、または取得エラー・異常値を検出した場合にAPIを停止します。新規アカウントなどでFree Tier APIが空の使用量を返す場合は、ログイン不能を避けるため停止しません。全アカウントの月額費用が$0.01の予算の1%を超えたときのAWS Budgets通知も監視Lambdaに接続し、APIを停止して通知先メールへ知らせます。監視は停止したAPIを自動再開しません。

### AWSの導入手順

以下は旧AWS構成を将来作り直す場合の手順です。現在のAWSスタックは削除済みです。AWS CLI **v2**・SAM CLIを導入し、ご自身のAWSアカウントでCLI認証を設定してください（可能なら一時認証を推奨）。ブラウザでAWSコンソールにログインするだけではCLIは認証されません。アクセスキーや秘密鍵をリポジトリやチャットへ貼らないでください。再デプロイには新たな料金が生じる可能性があります。

```bash
aws sts get-caller-identity
cd backend
npm ci
PATH="$PWD/node_modules/.bin:$PATH" sam build --template-file template.yaml
sam deploy --guided --region ap-northeast-1 --capabilities CAPABILITY_IAM
```

デプロイ時の`AlertEmail`には受信可能なメールアドレスを入力してください。メールアドレスを公開リポジトリに書かないでください。`sam deploy --guided`が保存する`backend/samconfig.toml`もGit管理対象外にしています。AWS Budgetsから届く確認メールのリンクを開かないと通知を受け取れません。

初回デプロイ後はAWSコンソールでアカウントのFree/Paidプラン、クレジット、有効な無料枠、Budgetsの通知先、監視Lambdaの実行結果を確認してください。監視によってAPIが停止された後は、停止理由と費用を確認してから、Lambdaの予約済み同時実行数を解除して再開します。監視LambdaのIAM権限はIAM Policy Autopilotの生成結果を基に、停止対象のLambdaだけに限定しています。

デプロイ後、出力された`ApiUrl`、`ClientId`、`AuthDomain`を使い、GitHubリポジトリの`Settings` → `Secrets and variables` → `Actions` → `Variables`に次を設定してPagesを再デプロイします。

| 変数 | 値 |
| --- | --- |
| `BODYMAKE_API_URL` | `ApiUrl` |
| `BODYMAKE_CLIENT_ID` | `ClientId` |
| `BODYMAKE_AUTH_DOMAIN` | `AuthDomain` |
| `BODYMAKE_CALLBACK_URL` | `https://waveargz.github.io/Healthapp/auth/callback/` |
| `BODYMAKE_LOGOUT_URL` | `https://waveargz.github.io/Healthapp/` |
| `BODYMAKE_GOOGLE_SIGN_IN_ENABLED` | Googleログインの設定完了後に `true` |

ローカル開発には同じ値を`.env.local`へ`NEXT_PUBLIC_BODYMAKE_*`という名前で設定します（書式は`.env.example`参照）。これらはブラウザに公開される値であり、AWSアクセスキーや秘密鍵を入れないでください。Cognitoでの新規登録時はメール確認が必要です。AWS版への切り替え時、従来の端末内のデモ記録は自動移行されません。

### Googleログインの有効化

Google Cloud ConsoleでOAuth同意画面を設定し、種類が**ウェブアプリケーション**のOAuth 2.0クライアントを作成します。Google側の承認済みリダイレクトURIには、Cognitoの次のURLを登録します。

```text
https://bodymake-147997153211-ap-northeast-1.auth.ap-northeast-1.amazoncognito.com/oauth2/idpresponse
```

GoogleのクライアントIDとクライアントシークレットは、Cognitoコンソールの「ソーシャルプロバイダーと外部プロバイダー」からGoogle IDプロバイダーへ直接登録します。シークレットはGitHub Actions変数、`.env.local`、リポジトリ、チャットに書かないでください。Google IDプロバイダーを追加後、`EnableGoogleSignIn=true`でSAMスタックを更新し、アプリクライアントのGoogle有効化をCloudFormationにも記録します。CognitoはGoogleを外部IDプロバイダーとして扱い、アプリは認可コード+PKCEでログインします。GitHub Pagesの変数`BODYMAKE_GOOGLE_SIGN_IN_ENABLED`を`true`にしてPagesを再デプロイすると、ログイン・新規登録画面に「Googleで続ける」が表示されます。

「ログイン状態を記憶する」を選ぶと更新トークンをこのブラウザの`localStorage`へ保存し、選ばない場合は`sessionStorage`へ保存します。共有端末では選ばないでください。公開前にはCSP、利用規約・プライバシー文書、退会・データ削除フロー、料金アラート、バックアップ運用を整備してください。より強いセッション保護が必要になった時は、静的PagesからBFF/HTTP-only cookie方式への移行を検討します。

費用は「必ず無料」ではありません。Free Tier APIとBudgetsには集計遅延があり、無料枠の対象外・期限切れ・表示されない料金もあります。**API停止後もS3保存量、DynamoDBのプロビジョンド容量、Cognitoなどの費用は継続し得ます。AWSアカウント全体を無課金で強制停止する仕組みではありません。** [Cognito](https://aws.amazon.com/cognito/pricing/)、[DynamoDB](https://aws.amazon.com/dynamodb/pricing/)、[Lambda](https://aws.amazon.com/lambda/pricing/)、[API Gateway](https://aws.amazon.com/api-gateway/pricing/)、[S3](https://aws.amazon.com/s3/pricing/)の最新料金を東京リージョン・自分のアカウントで確認してください。DynamoDBは無料枠を使いやすいよう各テーブルをプロビジョンド1 RCU/1 WCUにしていますが、負荷が増えるとスロットリングが起きます。学習用データの低頻度アーカイブをGoogle Driveへ移す余地はありますが、容量だけを理由に個人記録や身体写真を自動的にDriveへ移しません。移行時は同意・アクセス制御・削除手順を別途設計してください。

ユーザープール・DynamoDBテーブル・写真バケットは誤削除防止のためスタック削除時も`Retain`します。2026年10月11日の削除では、バックアップ後にこれらも個別に削除しました。将来再デプロイして削除する場合は、同じ確認が必要です。旧記録のローカルバックアップと復旧上の制約は [Firebase移行記録](./FIREBASE-MIGRATION.md) を参照してください。

食事写真のAI候補だけは、`@huggingface/transformers` の公開ONNXモデルをブラウザ内で実行します。初回は約200MBのモデルをダウンロードしてブラウザキャッシュに保存しますが、料理写真を推論APIへ送信しません。認識後に料理名とカロリー・PFCを手で修正できます。デモ版では正解データと写真をこの端末のIndexedDBへ最大150件保存します。AWS版では端末内の正解ラベルをログインアカウントごとに分離し、食事写真は保存しません。

### 共通Driveへの学習データ保存（Firebase版・デモ版）

AWS設定がないデモ版ではユーザーごとのDriveではなく、アプリ所有者のDriveに集約できます。GitHub Pagesだけでは所有者のGoogle Driveへ安全に書き込めないため、リポジトリ内の `scripts/google-drive-training-ingest/Code.gs` をApps Scriptの受け口として使います。AWS版ではこの経路は使わず、写真を含まない学習シグナルを別のDynamoDBテーブルに保存します。

Firebase Hostingの本番版には、2026年10月15日に承認・デプロイしたApps Scriptの公開URLを既定の送信先として組み込んでいます。テスト環境は分離し、`NEXT_PUBLIC_BODYMAKE_TEST_TRAINING_ENDPOINT` を設定しない限り共有Driveへ送りません。送信先URLを変更した場合は本番を再ビルド・再デプロイしてください。

1. `script.google.com` で新しいApps Scriptプロジェクトを作り、`Code.gs` の内容を貼り付けます。
2. Apps Scriptの「プロジェクトの設定」で「マニフェスト ファイル `appsscript.json` をエディタで表示する」を有効にし、同梱の `appsscript.json` の内容に置き換えます。
3. 「デプロイ」→「新しいデプロイ」→「ウェブアプリ」を選び、「次のユーザーとして実行」は自分、「アクセスできるユーザー」は全員（匿名ユーザーを含む）にしてデプロイします。Driveへの保存は所有者権限で行い、リクエスト内のGoogleトークンをGoogleのToken InfoとUserInfoで検証します。未認証の送信は受け付けません。
4. 表示された `/exec` URLをGitHubリポジトリの `Settings` → `Secrets and variables` → `Actions` → `Variables` に `BODYMAKE_TRAINING_ENDPOINT` という名前で登録し、Pagesワークフローを再実行します。URLは全利用者共通の公開設定としてビルドへ埋め込みます。OAuthクライアントIDは初期設定済みです。Google Cloudの承認済みJavaScript生成元に `https://waveargz.github.io` と `http://localhost:3000` を登録してください。
5. 正解データを共有する時は、利用者が同意チェックを入れ、Googleログインを完了した場合だけ送信されます。写真はブラウザ上で最大1280pxのJPEGに再生成してEXIFを除去します。保存するのは写真、AI候補ID、正解料理名・ID、カロリー・PFC、記録日時です。氏名・メールアドレス・GoogleトークンはDriveに保存しません。

アプリから同意を得て送信された正解の保存先は、非公開の `foodDB` 内にある [BodyMake アプリ修正データ](https://drive.google.com/drive/folders/1Xwg_SFmpQAukpXMdBdZx8T5J9w66-vuG) です。`Code.gs` は親が `foodDB` であることと共有設定を検査し、条件が違えば保存せず失敗します。リポジトリ内のスクリプトを変更しても稼働中のApps Scriptは自動更新されません。既存のApps Scriptへ反映して新バージョンをデプロイし、実際のDrive保存を確認するまでは送信・学習が完了したとは扱わないでください。

Apps Scriptのウェブアプリはブラウザから応答本文を読み取れないため、画面は送信操作の完了までを表示し、Driveへの保存成否を確約しません。GitHub Pages版でActionsの変数が未設定でも同じ既定URLを利用します。Apps Scriptの無料枠・容量・実行回数に依存し、1アカウントあたり6時間で10件に制限します。匿名HTTP入口自体は公開されますが、GoogleアカウントトークンをGoogle側で照合し、写真サイズ・入力値・件数を検証してから保存します。大規模公開や高い可用性が必要になった場合は、別の認証付き保存基盤を検討してください。

### 写真認識の学習・評価（所有者のPCで実行）

公開画像から基本モデルを改善する流れと、利用者が修正した付加データは分離しています。自律サイクルは `training-data/commons/` だけを扱います。Wikimedia Commons APIでファイルごとのCC0・CC BY・パブリックドメインの表示を確認して取得し、作者・元ページ・ライセンスを `sources.json` に記録します。カテゴリ由来の料理名は仮ラベルです。`training-data/` と `ml/artifacts/` はGitの対象外です。

```bash
# 追加収集、確認キュー、学習と評価の1サイクル
npm run food-ai:agent
# 定期エージェントはこの2段階の間で画像を目視確認する
npm run food-ai:agent -- --collect-only
npm run food-ai:agent -- --skip-collect
npm run test:food-ai
```

収集対象は枝豆を加えた28分類です（本番の候補は27分類のまま）。件数の少ない分類から優先し、1サイクル最大300枚・写真等のローカル保存総量1GB・各工程20分を上限にしています。PCの空き容量は最低5GB残し、API要求回数の上限などに達すれば300枚未満でも停止します。同時実行を防ぎ、写真・確認結果・学習コードが同じなら再学習を省略します。最新状態は `ml/artifacts/agent-latest.json`、過去の結果は `ml/artifacts/runs/<実行日時>/` に保存します。誤認識への重点収集は `npm run food-ai:collect -- --labels edamame,natto --max-new 60` のように指定できます。

確認用の一覧画像とファイル対応表は1サイクル最大72枚分を `ml/artifacts/review-queue/` に作成します。Codexまたは人が実際の画像を確認し、明確な料理だけ採用します。非食品、図、曖昧な複数料理は除外します。採用したJSONには `labelVerified: true` と、`review` 内の確認方法（`visual-agent` または `human`）、確認者、日時、画像SHA-256を記録します。Codexによる確認は人による確認と区別します。モデル自身の予測を正解にする処理はありません。除外済みの写真は研究用学習にも使いません。詳細は [学習エージェントの運用](scripts/food-ai/README.md) を参照してください。

公開データの画像・正解・出典と学習成果は、非公開のDriveアーカイブへ保管できます。合計4TBの台帳管理、差分転送、実保存後の照合手順は [Drive保管の運用](scripts/food-ai/DRIVE-ARCHIVE.md) を参照してください。Nutrition5kの画像・重量・栄養正解データは別データセットとして保管し、料理名の候補順位補正には混ぜません。利用者の私的な食事写真や認証情報も、この公開データ向けバックアップには含めません。

学習するのは既存CLIPの候補出力を補正する小さな層です。画像モデル本体の追加学習ではありません。学習・検証・テストへの割当てを保存し、追加収集後も既存写真を別区分へ移しません。完全・近似重複とラベル矛盾を除外し、モデル選択には検証用データだけを使います。元モデルと現在採用中のモデルの両方に対する改善、上位候補・分類別の悪化、分類網羅率を確認します。固定テストは繰り返し使う回帰評価であり、毎回新しい未知データでの精度保証ではありません。

自動採用の行き先は `lib/food-ai/test-calibration.json` のみです。`npm run dev:test`（3001番）の写真認識がこのモデルを使用します。本番用の `deployed-calibration.json` と公開サイトへの反映は別操作です。確認済み写真が不足する場合は仮ラベルで研究結果を保存しますが、自動採用しません。「研究用正解率」を実利用時の認識精度とは扱わないでください。

個別の検査・学習も可能です。利用者が共有した修正データを使う場合は独立したフォルダと確認記録を用意してください。AWSやDriveから利用者データをこの自律サイクルへ自動取り込みする機能はありません。

```bash
npm run food-ai:learn -- --data /写真とJSONのあるフォルダ --prepare-only
npm run food-ai:learn -- --data /写真とJSONのあるフォルダ
# テスト用ファイルを更新する明示的な操作。合格時のみ更新
npm run food-ai:learn -- --data /写真とJSONのあるフォルダ --promote
```

既定の学習・3001番の候補は `lib/food-ai/test-photo-labels.json` の28種類、本番は `photo-labels.json` の27種類です。ラベル追加と補正器の採用は別で、採用条件は緩めません。学習開始には独立写真100枚以上・5分類以上が必要です。データ追加だけで改善する保証はありません。この学習は料理名候補の順位を対象にしており、量やPFCを写真から学習する処理ではありません。本番APIは27分類の学習シグナルを受け付けるため、新候補の公開前にはスキーマとモデル互換性の確認も必要です。

なお、現在の基盤モデルであるCLIPの[モデルカード](https://huggingface.co/openai/clip-vit-base-patch32)は、公開アプリでの利用を想定用途の範囲外としています。商用提供前にはモデルと利用条件・実データでの性能を別途確認し、必要なら基盤モデルを置き換えてください。公開画像のライセンス確認だけで商用提供全体の可否は決まりません。

このチャットの定期実行は、収集・目視確認・学習・評価を継続します。ローカル作業のためPCとCodexアプリが起動している必要があります。Codexの利用枠を使用し、学習計算はPCで実行します。スケジュールの停止・頻度変更はCodexのスケジュール画面から行えます。

詳細食品のカロリー・PFCは、文部科学省の[日本食品標準成分表（八訂）増補2023年](https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html)「第2章（データ）」にある可食部100g当たりの値です。食品名・分類・調理状態も原表の日本語表記を使い、食品番号を保持します。元の米国向け詳細13,014件は検索対象から外しました。たんぱく質・脂質・炭水化物が微量 `Tr` の場合は表示精度に合わせ0gとし、PFCが未掲載の1件は除外しています。資料の利用については[文部科学省の案内](https://www.mext.go.jp/a_menu/syokuhinseibun/)に従い、出典を明記しています。

よく使う定番料理187件は、従来の[USDA FoodData Central](https://fdc.nal.usda.gov/)由来の食品から日本向け候補を選び直したものです。日本で一般的ではない米国向けの料理23件を外し、英語の原文は画面・定番データに含めません。これらの栄養値は日本のレシピそのものの分析値とは限りません。詳細食品と定番料理で同名の食品が重複しないよう一覧化し、栄養値の違う候補があるときは追加前に確認できます。実際の料理や商品・分量によって値が変わるため、記録前に確認してください。

定番料理は `lib/data/food-selections.mjs` と `lib/data/food-library.json`、詳細食品は `public/data/food-library-extended.json` です。詳細食品は検索時に別ファイルから読み込みます。食品数は、写真と正解を端末内に最大150件保存する上限とは別です。認識後に自由入力した正解名と栄養値は保存されます。画像モデル本体のファインチューニングはまだ行いませんが、既存モデルの出力を補正する学習・評価ツールは上記のとおり用意しています。詳細データを再生成する場合は、上記の文部科学省ページから「第2章（データ）」のExcelを取得し、`openpyxl` をインストールして次を実行します。

```bash
python3 -m pip install openpyxl
npm run generate:food-data -- /path/to/第2章（データ）.xlsx
npm run validate:food-data
```

定番料理のみを再生成するには、USDAのFNDDSとSR LegacyのZIPを取得して `npm run generate:curated-food-data -- /path/to/FNDDS.zip /path/to/SR-Legacy.zip` を実行します。このコマンドには `unzip` が必要で、文部科学省の詳細データは上書きしません。このMVPの学習は、オフラインで行う料理候補順位の補正です。自由入力のラベルは将来のモデル学習用データとして蓄積されますが、写真認識モデル自体はオンライン学習しません。

旧AWS版の接続ポイントはコードとして残していますが、接続先は削除済みです。`lib/cloud/config.ts`の設定値で`lib/api/client.ts`が保存先を切り替え、`lib/auth/cognito-session.ts`がログイン・更新・ログアウトを扱います。`backend/handler.mjs`では個人記録と学習シグナルを別テーブルへ保存する設計でした。現行の公開版はFirebaseを利用します。CloudFrontは導入していません。
