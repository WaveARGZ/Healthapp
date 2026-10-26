# BodyMake

「理想の身体を、見える目標に。」をコンセプトにした、スマートフォンファーストの体づくり支援Webアプリです。筋トレ・食事・体重・身体写真を一つの流れで記録し、数字だけではない身体の変化を追えるMVPを実装しています。

Firebase（Spark）版は `healthapp-14a3f` に接続し、Googleログイン・個人別Firestoreルール・静的サイトを公開しました。接続状態と残る検証は [FIREBASE-MIGRATION.md](./FIREBASE-MIGRATION.md) を参照してください。身体写真は端末内保存です。旧AWS環境は2026年10月11日に削除しました。旧記録のFirebaseへの自動移行は行っていません。

## チーム共通の始め方（現行）

共有する最新版は [WaveARGZ/Healthapp の `main`](https://github.com/WaveARGZ/Healthapp) です。GitHubの招待を受け取り、各自のアカウントで承諾してから作業します。Codexでは各自が取得したこのリポジトリのフォルダを開いてください。チャット履歴はGitでは共有されないため、最初にこのREADMEと `AGENTS.md` を読みます。

初回はGit、Node.js **22.23.4**（`.nvmrc`）、npm **10系**を用意します。Node.jsの最低対応版は22.13.0です。通常の画面開発に `.env.local`、本番の認証情報、Driveへのアクセス権は不要です。

```bash
git clone https://github.com/WaveARGZ/Healthapp.git
cd Healthapp
npm ci
npm run dev:test
```

[テスト画面](http://localhost:3001/bodymake/)／[食事写真画面](http://localhost:3001/food-photo/)を開きます。初期状態は各ブラウザ内のデモ保存で、学習写真の送信は無効です。`dev:test`・`build:test` はmacOS・Linux・Windowsで同じコマンドを使います。GitHubでコードを取得しても、他人の個人記録やDriveデータが端末に同期されることはありません。

### 毎回、最新版から作業を始める

未保存の変更があれば先に自分の作業ブランチへコミットしてください。変更を消す `reset --hard` や強制pushで揃えません。作業がない状態で次を実行します。

```bash
git switch main
git pull --ff-only origin main
npm ci
git switch -c codex/自分の名前-今回の作業名
npm run dev:test
```

ブランチ名は作業ごとに新しくします。変更はそのブランチへpushし、`main` 宛てのPull Requestを作成します。自動チェックと変更内容を確認し、別メンバーのレビュー、または所有者による対象PRの明示承認を得てマージします。所有者が承認した回は、別メンバーのレビューを待つ必要はありません。全員が同じブランチを直接書き換えず、他の人のマージ後は次の作業前にもう一度最新版を取得してください。`pull --ff-only` が失敗したら強制上書きせず、分岐や作業中の変更を確認します。

**コードの共有と本番公開は別です。** `main` へのpush・マージでは本番サイトを更新しません。旧GitHub Pagesは手動実行のみ、本番Firebase Hosting・Apps Script・本番モデルの変更は所有者の明示承認後に別途実施します。GitHubの参加権限はGoogle/Drive/Firebaseの管理権限ではありません。

**所有者の承認による本番更新:** 所有者が「PR #○と#○を本番Firebase Hostingへ反映して」など、その回の変更と公開先を指定して承認すれば、別メンバーのレビューを必須にせず、変更確認・自動テスト・本番ビルド後に公開できます。未コミットの作業を保持し、最新のマージ済み`main`と公開する内容が一致すること、接続先が本番用であることを確認します。公開後はコミット・URL・検証結果を報告します。承認はその回だけに適用し、将来の自動本番公開や、データベース・認証・権限・学習モデルなど別サービスの変更は許可しません。

### 3人用の共有テスト環境

[共有テストを開く](https://bodymake-test-14a3f.web.app/bodymake/) ／ [食事写真だけを開く](https://bodymake-test-14a3f.web.app/food-photo/)。所有者が登録した3人のGoogleアカウントでログインし、各自のプロフィール・筋トレ・食事・体重のテスト記録を別端末でも確認できます。他のメンバーの個人記録は見えません。身体写真は本番同様に端末内保存で、端末間同期しません。

公開画面と同じコード・27分類の写真認識を基準にし、画面とホーム画面アイコンには「テスト」と表示します。記録先・ログインは本番と別の無料Firebaseプロジェクトです。本番記録や写真・非公開学習台帳はコピーしません。学習用Drive送信はテストでは無効です。ページ自体は公開URLですが、記録の読み書きは登録済みの本人だけです。

開発時は上記の共通手順で最新版を取得し、作業ブランチからPull Requestを作ります。`codex/**` または `main` にpushすると、`Deploy shared test (never production)` がチェック後に**共有テストURLだけ**を更新します。3人共通の1つのURLなので、別の作業ブランチの反映で表示が変わることがあります。更新前にチームで声を掛け、GitHub Actionsで反映したブランチとコミットを確認してください。失敗した更新は公開されず、前の正常版が残ります。本番には自動反映しません。`main` へのマージには上記の自動チェック・変更確認と、別メンバーのレビューまたは所有者の明示承認が必要です。

ローカルでも共有テストのGoogleログインと記録を使う場合は `npm run dev:shared-test` を使います（3001番、同時に `dev:test` を起動しないこと）。通常の `npm run dev:test` はログイン不要の端末内デモのままです。共有テストをビルドする場合は開発サーバー停止後に `npm run build:shared-test`、続いて `npm run test:shared-test-build` を使います。秘密鍵や `.env.local` の受け渡しは不要です。

無料枠超過時には利用制限・停止があり得ます。Sparkを維持し、請求先・有料プラン・Cloud Storage・Functions・有料AIは追加しません。GitHub Actionsは公開リポジトリの標準ランナーを使用します。デプロイ用の短期認証はテスト用Hostingの権限だけで、本番権限やFirestoreの記録・参加者一覧を変更する権限はありません。参加者管理は [テスト専用アクセス制御](./FIREBASE-TEST-ACCESS.md) を参照してください。

### 共有前の安全なテスト

写真送信のテストには `python3` コマンドで呼び出せるPython **3.12** と、画像生成用のPillow **12.0.0**などが必要です。macOS・Linuxでは次のように開発用の依存ライブラリを準備します。Windowsの画面開発は上記の起動方法を利用でき、Pythonを含む全テストは実機検証が済むまでWSLでの実行を推奨します。

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install --no-cache-dir -r scripts/food-ai/streaming/requirements.txt
npm run lint
npm run test:team-runtime
npm run test:photo-submission
npm run test:food-ai:model-cache
npm run test:food-ai:stream
npm run test:workout-split
npm run test:mobile-viewport
npm run build:test
npm run test:environment-build
```

テスト開発サーバーを停止してから `build:test` を実行してください。写真送信・ストリーミングの上記テストはRAM上の合成データとモックを使用し、実写真送信・Google認証・Drive書き込み・学習は行いません。依存ライブラリやアプリのビルド成果物には通常の開発用ディスク容量が必要です。旧 `npm run test:food-ai` は一時ファイルを作るテストを含むため、現在の学習データ保存方針では一括実行しません。

### 学習処理は所有者の検証済みPCだけ

チームメンバーはソースとモックテストを共有できますが、実データの学習環境まで複製する設定ではありません。現行のDrive専用処理は、所有者PCにあるGit対象外の過去の出典・受領台帳・確認済み分割・除外記録を読み取り専用で必要とします。新規cloneなどで必要な履歴がない場合は `owner_learning_state_missing` で停止します。空の台帳を作って回避したり、認証JSON・写真・非公開台帳をリポジトリへ追加したりしないでください。

学習ランチャーや実行プログラムは所有者以外のPCでは起動しません。3003の同時実行防止は**同じPC内だけ**であり、複数PCのDrive書き込みを排他制御しません。所有者も同じDriveへの実行を1台に限定します。新しい画像・ラベル・レビュー・評価・モデル・台帳・アーカイブ・キャッシュはPCへ保存せず、既存のローカル学習データは削除・上書きしません。実行条件は [Drive専用方式の運用](scripts/food-ai/streaming/README.md) と最新のDrive上の記録を確認してください。以下に残るAWSと旧ローカル学習の手順は履歴であり、チーム参加時のセットアップではありません。

## 公開ビュー

Firebase版は [BodyMakeを開く](https://healthapp-14a3f.web.app/) から利用できます。ルートURLは `/bodymake/` に転送されます。ポートフォリオ画面は削除しました。従来の [GitHub Pages版](https://waveargz.github.io/Healthapp/) も残っていますが、更新は `deploy-pages.yml` の手動実行だけです。`main` へのpushではどちらも自動公開しません。Firebase Hostingへの反映にはビルドと明示的なデプロイが必要です。

食事専用ページ `/food-photo/` で学習用の正解を共有する場合は、**Google認証（2段階認証を含む）→写真・料理名の入力→明示同意→共有**の順に進みます。送信ボタンでは再び認証画面を開かず、有効期限内のメモリ上の認証を使います。認証待ちは最大10分で、画面から中断してやり直せます。期限切れ・認証拒否の場合は入力と受付番号を保持して再認証を案内し、認証だけでは自動送信しません。認証なしの解析も選べます。

写真・正解・認証情報は永続保存しないため、OSがページを破棄した場合や再読み込み・別ブラウザへの移動後には復元できません。先に認証してから入力することで、入力後の2段階認証を避けます。実機でページが破棄された場合の完全な復元を保証するものではありません。通常の記録アプリの食事保存・Firebaseログインはこの変更の対象外です。

## テスト環境と本番環境

| 環境 | 起動・公開先 | 保存先 | 本番への反映 |
| --- | --- | --- | --- |
| ローカルテスト | `npm run dev:test` → `http://localhost:3001/bodymake` | 初期状態はこのブラウザ・ポート専用の端末内保存 | なし |
| 3人用共有テスト | `https://bodymake-test-14a3f.web.app/` | テスト専用Firestore・登録済みGoogleアカウント本人の記録。身体写真は端末内 | テストのみ自動更新。本番は変更しない |
| Firebase公開版 | `https://healthapp-14a3f.web.app/` → `/bodymake/` | Googleログイン・ユーザー別Firestore。身体写真は端末内 | ローカルでビルド後、Firebase CLIで明示デプロイ |
| 旧GitHub Pages版 | GitHub Pagesの公開URL | 旧AWS接続先は削除済み（AWS未登録のビルドはデモ保存） | 承認後にワークフローを手動実行 |

`npm run dev:test` は画面に「テスト環境」と表示し、ビルド先も `.next-test` に分けるため、通常の開発サーバーと同時に起動できます。`localhost:3000` と `localhost:3001` はブラウザの保存領域が異なり、筋トレ・食事・写真・ログイン状態を共有しません。テスト環境は本番用の `NEXT_PUBLIC_BODYMAKE_*` 設定を読み取らず、AWSテスト用の設定がなければ端末内保存になります。学習データの送信先も初期状態では無効です。

旧AWS結合テスト用の設定項目はコードに残っていますが、現在のチーム開発では使いません。`NEXT_PUBLIC_BODYMAKE_TEST_AUTH_DOMAIN`、`NEXT_PUBLIC_BODYMAKE_TEST_CLIENT_ID`、`NEXT_PUBLIC_BODYMAKE_TEST_API_URL` などは空欄のままとし、この手順のためにAWSスタックを作成しないでください。

`npm run build:test` はデモ保存のテスト設定、`npm run build:shared-test` は3人用共有テスト設定の静的ビルドを検証します。テストの成果物は `.next-test/`、本番ビルドの静的書き出しは `out/` に分かれます。ただし、各テスト開発サーバーとテストビルドは同じ `.next-test/` を使うため同時実行しないでください。共有テストは別FirebaseプロジェクトのHostingへ公開し、本番URLや旧AWSは変更しません。

コードの確認は `main` 宛てのPull Requestと `main` 更新時に `verify-test.yml` が行います。lint・写真送信と学習処理のモックテスト・テストビルド・本番認証の分離・画面幅と筋トレ分割を検証します。これは実スマホ撮影や本番Drive保存の実動作確認ではありません。別の `deploy-shared-test.yml` は共有テストだけを更新し、本番公開ワークフローは実行しません。

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
  - 認識後に正解料理名とカロリー・PFCを修正可能。学習用写真・正解は画面のメモリ内で扱い、同意時だけ非公開Driveへ送信
  - 学習データ共有は任意で毎回の明示同意が必要。Google認証後に共通Driveへ写真と正解を送信し、学習用写真・正解・認証情報は端末へ永続保存しない
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

チーム開発では冒頭の「チーム共通の始め方」を使用します。取得済みのプロジェクト直下で、Node.js 22.12.0・npm 10系を使います。

```bash
npm ci
npm run dev:test
```

ブラウザで [http://localhost:3001/bodymake/](http://localhost:3001/bodymake/) を開いてください。通常の `npm run dev` は本番用の接続設定を読み込む可能性があるため、チーム共通の確認には使いません。

品質チェックは冒頭の安全なテスト一覧を使用してください。食品辞書の読み取り検証は追加で次を実行できます。

```bash
npm run validate:food-data
npm run test:food-catalog
```

この環境ではTurbopackがCSS処理の内部プロセス用ポートを開けないため、`npm run build` は Next.js 公式の `--webpack` オプションを使う設定にしています。アプリのルーティング・コンポーネント・型チェックを含めた本番ビルドは成功済みです。

`test:static-ui` はビルド済みの12画面について、日本語設定、見出し、指定ロゴの実ファイル参照、下部／左ナビの5項目と選択状態を検証します。GitHub Pagesのパス確認は `GITHUB_ACTIONS=true GITHUB_REPOSITORY=WaveARGZ/Healthapp npm run build` の後に同じテストを実行します。ブラウザ上での操作・レイアウト検証の代替ではありません。

## 保存方法と旧AWS構成（履歴・現行セットアップでは実行しない）

この節のAWS導入・Googleログイン設定は削除済みの旧環境の資料です。現在の公開版はFirebaseです。チーム参加のためにAWSリソース、Google認証設定、公開先を作成・変更する必要はありません。再構築は別途の明示承認が必要です。

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

食事写真のAI候補だけは、`@huggingface/transformers` の公開ONNXモデルをブラウザ内で実行します。初回は約200MBのモデルをダウンロードしてブラウザキャッシュに保存しますが、料理写真を推論APIへ送信しません。認識後に料理名とカロリー・PFCを手で修正できます。解析できない場合も料理名を手入力して続けられます。写真と学習用の正解は画面のメモリ内で扱い、IndexedDBへ新規保存しません。

### 共通Driveへの学習データ保存

食事写真画面の学習共有は、アプリ所有者の非公開Driveへ集約します。リポジトリ内の `scripts/google-drive-training-ingest/Code.gs` をApps Scriptの受け口として使い、学習用写真・正解の送信先はこの経路に統一しています。

Firebase Hostingの本番版には、2026年10月15日に承認・デプロイしたApps Scriptの公開URLを既定の送信先として組み込んでいます。テスト環境は分離し、`NEXT_PUBLIC_BODYMAKE_TEST_TRAINING_ENDPOINT` を設定しない限り共有Driveへ送りません。送信先URLを変更した場合は本番を再ビルド・再デプロイしてください。

1. `script.google.com` で新しいApps Scriptプロジェクトを作り、`Code.gs` の内容を貼り付けます。
2. Apps Scriptの「プロジェクトの設定」で「マニフェスト ファイル `appsscript.json` をエディタで表示する」を有効にし、同梱の `appsscript.json` の内容に置き換えます。
   初回のみ所有者として `setupTrainingInbox` を実行し、非公開の受信フォルダと再送照合用の鍵を設定します。既存の受信設定・鍵は変更しません。
3. 「デプロイ」→「新しいデプロイ」→「ウェブアプリ」を選び、「次のユーザーとして実行」は自分、「アクセスできるユーザー」は全員（匿名ユーザーを含む）にしてデプロイします。Driveへの保存は所有者権限で行い、リクエスト内のGoogleトークンをGoogleのToken InfoとUserInfoで検証します。未認証の送信は受け付けません。
4. 表示された `/exec` URLをGitHubリポジトリの `Settings` → `Secrets and variables` → `Actions` → `Variables` に `BODYMAKE_TRAINING_ENDPOINT` という名前で登録し、Pagesワークフローを再実行します。URLは全利用者共通の公開設定としてビルドへ埋め込みます。OAuthクライアントIDは初期設定済みです。Google Cloudの承認済みJavaScript生成元には公開先の `https://healthapp-14a3f.web.app`、GitHub Pagesも使う場合は `https://waveargz.github.io`、ローカル確認には `http://localhost:3000` を登録してください。
5. 正解データを共有する時は、利用者が同意チェックを入れ、Googleログインを完了した場合だけ送信されます。写真はブラウザ上で最大1280pxのJPEGに再生成し、エンコーダが再付与するEXIFも除去します。古い画面からの送信にも対応するため、受信側でもメモリ上で付加情報を除去し、構造検証した写真だけを保存します。利用者による除去操作は不要です。保存するのは写真、AI候補ID、正解料理名・ID、カロリー・PFC、記録日時です。氏名・メールアドレス・GoogleトークンはDriveに保存しません。

アプリから明示的な同意を得て送信する正解データの指定先は、非公開の `foodDB/01_app_feedback/` 内にある [inbox](https://drive.google.com/drive/folders/1EFN0vkkKJUbCDv9LwBj-ILatj3s-1Ezm) です。旧 [BodyMake アプリ修正データ](https://drive.google.com/drive/folders/1Xwg_SFmpQAukpXMdBdZx8T5J9w66-vuG) は保管用として残し、移動・削除・再アップロードしません。`Code.gs` は `foodDB → 01_app_feedback → inbox` の親子関係と非公開設定を検査し、条件が違えば保存せず失敗します。リポジトリ内のスクリプトを変更しても稼働中のApps Scriptは自動更新されません。実際の送信とDrive上の保存を検証するまでは、受領・学習済みとは扱わないでください。

Apps ScriptのContentService応答はGoogleの一時URLへリダイレクトされます。画面は共有前に受信サービスの種類・スキーマ・OAuthクライアント設定を照合し、Google認証を事前に読み込みます。認証画面を閉じた場合や開けない場合は待機を解除し、再試行できます。送信後は受付番号・写真SHA-256・写真とJSONの両ファイルIDが一致した場合だけ保存完了と表示します。通信や応答の読み取りに失敗した場合は同じ送信内容・受付番号で1回自動再送し、それでも確認できなければ画面内の写真と入力を保持します。ページを閉じるとメモリ内の内容は失われます。実利用者の同意済み写真を使った本番送信・Drive原本照合は別途確認が必要です。GitHub Pages版でActionsの変数が未設定でも同じ既定URLを利用します。Apps Scriptの無料枠・容量・実行回数に依存し、1アカウントあたり6時間で10件に制限します。匿名HTTP入口自体は公開されますが、GoogleアカウントトークンをGoogle側で照合し、写真サイズ・入力値・件数を検証してから保存します。[Apps Script ContentServiceのリダイレクト仕様](https://developers.google.com/apps-script/guides/content#redirects)

受領応答v3は `requestImageSha256` と `storedImageSha256` を分け、後者はDriveから完全再取得した保存画像のSHA-256です。古い画面向けの応答フィールド `imageSha256` は要求の確認値として残していますが、新しいクライアントは保存画像の値を返します。Drive内の正解JSONの `imageSha256` は従来どおり実際の保存画像のハッシュです。受信時の除去後の画像で再送照合するため、付加情報だけの違いでは重複保存しません。Apps Script所有者は `testPhotoMetadataInMemory` で、写真やDriveを使わず合成1px画像の除去・Blob・SHA-256処理を確認できます。

### 公開の食事写真AIページ

`/food-photo/` はBodyMakeの記録アカウントなしで利用できます。写真の解析はブラウザ内で行い、個人の食事記録や身体写真へアクセスしません。トップページからも移動できます。スマホではアルバム選択とカメラ撮影を別々に選べます。AI解析が長引く場合は待たずに料理名の手入力へ進めます。解析失敗後も同様に共有できます。正解データの共有は別操作で、同意チェックとGoogle認証を必須にしています。共有時に限りEXIFを除去した写真、AI候補ID、確認した料理名、栄養値の目安を上記の非公開inboxへ送ります。写真・栄養値をそのまま正解として自動学習しません。受領後は写真を独立に確認し、出典を分けた固定分割と評価を通過した場合のみテストモデルへの利用候補にします。本番モデルの変更は別途承認が必要です。削除依頼には画面の受付番号を用います。

### 写真認識の旧ローカル学習・評価（履歴・実行禁止）

**この節のコマンドは現在の運用では実行しません。** `food-ai:agent`、`food-ai:collect`、`food-ai:collect:nutrition`、`food-ai:review`、`food-ai:review:apply`、`food-ai:archive prepare`、`snapshot-learning`、`food-ai:learn` はPCへ学習データを書き込みます。新しいDrive専用方式が使える場合も禁止は解除されません。過去の仕様を残すため以下の説明は保持しますが、現行方式の最新状態や採用結果は [ストリーミング運用](scripts/food-ai/streaming/README.md) とDrive上の記録を確認してください。

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
