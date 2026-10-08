# BodyMake

「理想の身体を、見える目標に。」をコンセプトにした、スマートフォンファーストの体づくり支援Webアプリです。筋トレ・食事・体重・身体写真を一つの流れで記録し、数字だけではない身体の変化を追えるMVPを実装しています。

## 公開ビュー

`main` ブランチへのpush時にGitHub Pagesへ静的サイトを自動デプロイします。公開URLは [BodyMakeを開く](https://waveargz.github.io/Healthapp/) です。

## 実装済みの機能

- トップ、ログイン、新規登録、初期プロフィール・目標設定、写真から理想体型を作る初期ステップ
- ホームダッシュボード
  - 今日の日付・ユーザー名・現在体重・目標
  - 筋トレ / 食事 / 体重 / 身体写真の今日の記録状態
  - 保存済みの身体写真、過去7日間の実際の記録状況
  - フィードバック機能の準備中表示
- 筋トレ記録
  - 種目ごとに重量・回数・完了状態をセット単位で記録
  - セット／種目の追加・削除、総ボリューム表示、履歴表示・削除
  - 胸・背中・肩・腕・脚・腹筋／体幹・有酸素から検索して種目を選択
- 食事記録
  - 朝食 / 昼食 / 夕食 / 間食を選択し、料理を複数追加
  - 料理別のカロリー・PFCと食事合計を記録
  - 日本で一般的な定番料理187件と、文部科学省「日本食品標準成分表（八訂）増補2023年」の日本語食品2,537件を検索し、食べた重さからPFCを計算。ひらがな・カタカナ、料理の別名、軽微な誤字にも対応
  - 写真を端末内の無料AIで解析し、料理候補と同じ食品データに基づく栄養素を追加
  - 認識後に正解料理名とカロリー・PFCを修正可能。写真・正解ラベルを端末内に最大150件保存
  - 学習データ共有は任意で毎回の明示同意が必要。デモ版はGoogleログイン後に共通Driveへ写真と正解を送信。AWS版は写真を含まない修正シグナルのみ学習用DynamoDBへ送信
  - 正解データに基づき以後の候補順位を個人向けに補正
  - 蓄積した写真を所有者が確認・学習・評価し、改善時だけ料理候補モデルの補正器を更新するオフライン作業ツール
  - 履歴表示・削除
- 体重記録と一覧
- 正面・背面の身体写真選択、端末内保存、自動3パターン編集と画像保存
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

新規登録後はプロフィールと目標を設定し、`/onboarding/photos` で正面・背面の写真から各3パターンを生成します。6枚の生成を確認して元写真を端末に保存するとホームへ進みます。写真は後で登録するためにスキップできます。設定画面からプロフィールを再編集したときは写真ステップを繰り返さずホームへ戻ります。

## 身体写真の自動編集

初期写真ステップと `/photos` で正面・背面の写真を選ぶと、各写真から「自然」「カット」「強め」の3パターンを自動生成します。肩・ウエスト・腰の左右6点を単色背景から推定し、Canvas上で横方向の逆写像ワーピングを行います。体の内側を伸縮し、外側は体幅の2.6倍まで元画像へなめらかに戻します。縦方向の変形率にはsmoothstep補間、色のサンプリングには線形補間を使います。元写真にある陰影は局所コントラストで強調します。推定が外れた場合のみ、6点をドラッグして再生成できます。

3パターンの変形率は `lib/photos/body-warp.ts` の `bodyPatterns` に集約しています。具体的な強さは、実際の正面・背面写真の出力を見て調整する前提です。輪郭の変形と陰影の強調だけでは、元写真に写っていない筋肉のラインを新たに正確に生成できません。これらの画像は目標のイメージ用であり、将来の身体や体脂肪率の予測ではありません。

写真編集はブラウザ内で行い、編集結果はダウンロードできます。デモ版では容量を抑えた元写真を端末に保存します。AWS版では元写真を本人専用の非公開S3領域に保存し、署名付きURLで読み込みます。保存済み写真からも3パターンを再生成できます。背景が複雑な場合や被写体が大きくずれた場合は自動推定の精度が落ちます。

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

費用対策として、APIは**デプロイ直後は停止状態**（Lambda同時実行数0）です。別の監視Lambdaが6時間ごとにAWS Free Tier APIの当月使用量と予測使用量を確認し、いずれかの無料枠が80%以上になった場合、または確認に失敗した場合、APIを停止します。全アカウントの月額費用が$0.01の予算の1%を超えたときのAWS Budgets通知も監視Lambdaに接続し、APIを停止して通知先メールへ知らせます。APIには2リクエスト/秒・バースト5のスロットリングも設定しています。監視は停止したAPIを自動再開しません。

### AWSの導入手順

AWS CLI **v2**・SAM CLIを導入し、ご自身のAWSアカウントでCLI認証を設定してください（可能なら一時認証を推奨）。ブラウザでAWSコンソールにログインするだけではCLIは認証されません。アクセスキーや秘密鍵をリポジトリやチャットへ貼らないでください。この開発環境にはAWS CLI v1しかなく、AWS認証情報もないため実デプロイとAWS上の動作確認は未実施です。

```bash
aws sts get-caller-identity
cd backend
npm ci
PATH="$PWD/node_modules/.bin:$PATH" sam build --template-file template.yaml
sam deploy --guided --region ap-northeast-1 --capabilities CAPABILITY_IAM
```

デプロイ時の`AlertEmail`には受信可能なメールアドレスを入力してください。メールアドレスを公開リポジトリに書かないでください。`sam deploy --guided`が保存する`backend/samconfig.toml`もGit管理対象外にしています。AWS Budgetsから届く確認メールのリンクを開かないと通知を受け取れません。

初回デプロイ後はAWSコンソールでアカウントのFree/Paidプラン、クレジット、有効な無料枠、Budgetsの通知先、監視Lambdaの実行結果を確認してください。問題がなければ、出力された`ApiFunctionName`を使って手動でAPIを有効にします。以下の例は同時実行数を2に制限します。

```bash
aws lambda put-function-concurrency --function-name <ApiFunctionName> --reserved-concurrent-executions 2 --region ap-northeast-1
```

再停止する場合は`--reserved-concurrent-executions 0`に戻します。監視によって停止された後は、停止理由と費用を確認してから手動で再開してください。監視LambdaのIAM権限はIAM Policy Autopilotの生成結果を基に、停止対象のLambdaだけに限定しています。

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

続いて、GoogleのクライアントIDとクライアントシークレットを使って、`EnableGoogleSignIn=true`でSAMスタックを更新します。シークレットはGitHub Actions変数、`.env.local`、リポジトリ、チャットに書かず、デプロイ時だけのNoEchoパラメータとして入力してください。CognitoはGoogleを外部IDプロバイダーとして扱い、アプリは認可コード+PKCEでログインします。GitHub Pagesの変数`BODYMAKE_GOOGLE_SIGN_IN_ENABLED`を`true`にしてPagesを再デプロイすると、ログイン・新規登録画面に「Googleで続ける」が表示されます。

「ログイン状態を記憶する」を選ぶと更新トークンをこのブラウザの`localStorage`へ保存し、選ばない場合は`sessionStorage`へ保存します。共有端末では選ばないでください。公開前にはCSP、利用規約・プライバシー文書、退会・データ削除フロー、料金アラート、バックアップ運用を整備してください。より強いセッション保護が必要になった時は、静的PagesからBFF/HTTP-only cookie方式への移行を検討します。

費用は「必ず無料」ではありません。Free Tier APIとBudgetsには集計遅延があり、無料枠の対象外・期限切れ・表示されない料金もあります。**API停止後もS3保存量、DynamoDBのプロビジョンド容量、Cognitoなどの費用は継続し得ます。AWSアカウント全体を無課金で強制停止する仕組みではありません。** [Cognito](https://aws.amazon.com/cognito/pricing/)、[DynamoDB](https://aws.amazon.com/dynamodb/pricing/)、[Lambda](https://aws.amazon.com/lambda/pricing/)、[API Gateway](https://aws.amazon.com/api-gateway/pricing/)、[S3](https://aws.amazon.com/s3/pricing/)の最新料金を東京リージョン・自分のアカウントで確認してください。DynamoDBは無料枠を使いやすいよう各テーブルをプロビジョンド1 RCU/1 WCUにしていますが、負荷が増えるとスロットリングが起きます。学習用データの低頻度アーカイブをGoogle Driveへ移す余地はありますが、容量だけを理由に個人記録や身体写真を自動的にDriveへ移しません。移行時は同意・アクセス制御・削除手順を別途設計してください。

ユーザープール・DynamoDBテーブル・写真バケットは誤削除防止のためスタック削除時も`Retain`します。スタックを削除してもこれらのリソースと費用が残り得るため、不要になった際はデータのバックアップ・削除方針を確認してから個別に整理してください。

食事写真のAI候補だけは、`@huggingface/transformers` の公開ONNXモデルをブラウザ内で実行します。初回は約200MBのモデルをダウンロードしてブラウザキャッシュに保存しますが、料理写真を推論APIへ送信しません。認識後に料理名とカロリー・PFCを手で修正できます。デモ版では正解データと写真をこの端末のIndexedDBへ最大150件保存します。AWS版では端末内の正解ラベルをログインアカウントごとに分離し、食事写真は保存しません。

### 共通Driveへの学習データ保存（デモ版のみ）

AWS設定がないデモ版ではユーザーごとのDriveではなく、アプリ所有者のDriveに集約できます。GitHub Pagesだけでは所有者のGoogle Driveへ安全に書き込めないため、リポジトリ内の `scripts/google-drive-training-ingest/Code.gs` をApps Scriptの受け口として使います。AWS版ではこの経路は使わず、写真を含まない学習シグナルを別のDynamoDBテーブルに保存します。

1. `script.google.com` で新しいApps Scriptプロジェクトを作り、`Code.gs` の内容を貼り付けます。
2. Apps Scriptの「プロジェクトの設定」で「マニフェスト ファイル `appsscript.json` をエディタで表示する」を有効にし、同梱の `appsscript.json` の内容に置き換えます。
3. 「デプロイ」→「新しいデプロイ」→「ウェブアプリ」を選び、「次のユーザーとして実行」は自分、「アクセスできるユーザー」は全員（匿名ユーザーを含む）にしてデプロイします。Driveへの保存は所有者権限で行い、リクエスト内のGoogleトークンをGoogleのToken InfoとUserInfoで検証します。未認証の送信は受け付けません。
4. 表示された `/exec` URLをGitHubリポジトリの `Settings` → `Secrets and variables` → `Actions` → `Variables` に `BODYMAKE_TRAINING_ENDPOINT` という名前で登録し、Pagesワークフローを再実行します。URLは全利用者共通の公開設定としてビルドへ埋め込みます。OAuthクライアントIDは初期設定済みです。Google Cloudの承認済みJavaScript生成元に `https://waveargz.github.io` と `http://localhost:3000` を登録してください。
5. 正解データを共有する時は、利用者が同意チェックを入れ、Googleログインを完了した場合だけ送信されます。写真はブラウザ上で最大1280pxのJPEGに再生成してEXIFを除去します。保存するのは写真、AI候補ID、正解料理名・ID、カロリー・PFC、記録日時です。氏名・メールアドレス・GoogleトークンはDriveに保存しません。

Apps Scriptのウェブアプリはブラウザから応答本文を読み取れないため、画面は送信操作の完了までを表示し、Driveへの保存成否を確約しません。デプロイ前、またはGitHub Actionsの変数未設定時は共有ボタンを使えません。Apps Scriptの無料枠・容量・実行回数に依存し、1アカウントあたり6時間で10件に制限します。匿名HTTP入口自体は公開されますが、GoogleアカウントトークンをGoogle側で照合し、写真サイズ・入力値・件数を検証してから保存します。大規模公開や高い可用性が必要になった場合は、Cognito + API Gateway/Lambda + S3へ移行してください。

### 写真認識の学習・評価（所有者のPCで実行）

公開画像を集めて学習する実験フローもあります。Food-101は写真の権利が研究利用以外には明確に許諾されていないため採用しません。代わりにWikimedia Commons APIから、画像ごとのライセンスがCC0・CC BY・パブリックドメインと確認できた写真だけ取得し、作者・元ページ・ライセンスを `training-data/commons/sources.json` に記録します。カテゴリ名から付けた料理名は**仮ラベル**であり、実物の料理を人が確認するまでは公開モデルに反映できません。写真・正解データ・評価レポートは公開リポジトリへ入れないでください。`training-data/` と `ml/artifacts/` はGitの対象外です。

```bash
npm run food-ai:agent
npm run food-ai:collect -- --per-label 25
npm run food-ai:learn -- --data ./training-data/commons --prepare-only --allow-unreviewed
npm run food-ai:learn -- --data ./training-data/commons --allow-unreviewed
```

最初のコマンドは収集・検査・仮ラベル学習をまとめて行う実験エージェントです。最後のコマンドを単独実行しても同じ**研究用の仮ラベル実験**ができます。結果は候補補正器と評価レポートとして保存しますが、`--allow-unreviewed` と `--promote` は併用不可です。画像を確認して `ID.json` の `labelVerified` を `true` にし、料理名に誤りがあれば修正した後に、下記の通常フローで再学習します。Commonsのカテゴリや写真タイトルだけで正解を確定しません。また、利用条件は画像ごとに後日変更・訂正される可能性があるため、商用公開前に `sources.json` と元ページを再確認してください。

利用者が正解として共有したDriveデータを学習する場合は、上記のDrive受け口を先にデプロイする必要があります。所有者がDriveフォルダの `ID.jpg` と `ID.json` を同じローカルフォルダへ書き出し、次を実行します。

```bash
npm run food-ai:learn -- --data /写真とJSONのあるフォルダ --prepare-only
npm run food-ai:learn -- --data /写真とJSONのあるフォルダ
npm run food-ai:learn -- --data /写真とJSONのあるフォルダ --promote
```

最初のコマンドで画像の破損、JSONとの対応、完全・近似重複、矛盾した正解、対応外の料理を調べ、`ml/artifacts/review.csv` を出します。確認が必要な項目は自動学習に使いません。現在対応するのは `lib/food-ai/photo-labels.json` の27種類です。自由入力した別料理はDriveには蓄積されますが、対応ラベルを設計・追加してから学習します。2番目のコマンドは確認済みの独立写真が100枚以上、5種類以上の料理に各5枚以上ある場合だけ学習します。既存のCLIPモデルを固定し、出力した27種類の確率を補正する小さな層をPCで学習します。写真そのものをGitHubへ置いたり、アプリ利用中に自動学習したりはしません。

写真を料理ごとに学習用・検証用・未使用テスト用へ分け、検証用で学習設定を選びます。テスト用で元の候補と比較し、27料理すべてに独立した確認済み写真が各10枚以上あり、1位正解が2件以上増え、上位5件の正解数が減らない時だけ、`--promote` で `lib/food-ai/deployed-calibration.json` を更新します。詳細は `ml/artifacts/evaluation.json` で確認してください。モデル更新後にビルド・テストし、公開版へ反映します。評価が悪化した場合は従来の候補を維持します。これは27料理の**名前の候補順位**を改善する初期段階であり、量やカロリー・PFCを写真だけで正確に推定する学習ではありません。品質をさらに上げるには、多様で正確な写真を増やし、料理ごとの誤りを人が確認した上で、必要なら画像モデル本体の追加学習を別途検討します。

なお、現在の基盤モデルであるCLIPの[モデルカード](https://huggingface.co/openai/clip-vit-base-patch32)は、公開アプリでの利用を想定用途の範囲外としています。商用提供前にはモデルと利用条件・実データでの性能を別途確認し、必要なら基盤モデルを置き換えてください。公開画像のライセンス確認だけで商用提供全体の可否は決まりません。

エージェントはこの作業の実行、結果の点検、改良提案を手伝えますが、写真を分類するモデルそのものの代わりにはなりません。再学習は毎回評価してから手動で公開します。

詳細食品のカロリー・PFCは、文部科学省の[日本食品標準成分表（八訂）増補2023年](https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html)「第2章（データ）」にある可食部100g当たりの値です。食品名・分類・調理状態も原表の日本語表記を使い、食品番号を保持します。元の米国向け詳細13,014件は検索対象から外しました。たんぱく質・脂質・炭水化物が微量 `Tr` の場合は表示精度に合わせ0gとし、PFCが未掲載の1件は除外しています。資料の利用については[文部科学省の案内](https://www.mext.go.jp/a_menu/syokuhinseibun/)に従い、出典を明記しています。

よく使う定番料理187件は、従来の[USDA FoodData Central](https://fdc.nal.usda.gov/)由来の食品から日本向け候補を選び直したものです。日本で一般的ではない米国向けの料理23件を外し、英語の原文は画面・定番データに含めません。これらの栄養値は日本のレシピそのものの分析値とは限りません。詳細食品と定番料理で同名の食品が重複しないよう一覧化し、栄養値の違う候補があるときは追加前に確認できます。実際の料理や商品・分量によって値が変わるため、記録前に確認してください。

定番料理は `lib/data/food-selections.mjs` と `lib/data/food-library.json`、詳細食品は `public/data/food-library-extended.json` です。詳細食品は検索時に別ファイルから読み込みます。食品数は、写真と正解を端末内に最大150件保存する上限とは別です。認識後に自由入力した正解名と栄養値は保存されます。画像モデル本体のファインチューニングはまだ行いませんが、既存モデルの出力を補正する学習・評価ツールは上記のとおり用意しています。詳細データを再生成する場合は、上記の文部科学省ページから「第2章（データ）」のExcelを取得し、`openpyxl` をインストールして次を実行します。

```bash
python3 -m pip install openpyxl
npm run generate:food-data -- /path/to/第2章（データ）.xlsx
npm run validate:food-data
```

定番料理のみを再生成するには、USDAのFNDDSとSR LegacyのZIPを取得して `npm run generate:curated-food-data -- /path/to/FNDDS.zip /path/to/SR-Legacy.zip` を実行します。このコマンドには `unzip` が必要で、文部科学省の詳細データは上書きしません。このMVPの「学習」は、カタログ内の確定データに基づく個人向け候補順位の補正です。自由入力のラベルは将来のモデル学習用データとして蓄積されますが、写真認識モデル自体はオンライン学習しません。

AWSの接続ポイントは実装済みです。`lib/cloud/config.ts`の設定値で`lib/api/client.ts`が保存先を切り替え、`lib/auth/cognito-session.ts`がログイン・更新・ログアウトを扱います。`backend/handler.mjs`では個人記録と学習シグナルを別テーブルへ保存します。次の段階では実アカウントへのデプロイ、E2Eテスト、端末内デモ記録の明示的な移行、退会とデータ削除、Bedrockなどの追加機能を進めます。CloudFrontはまだ導入していません。
