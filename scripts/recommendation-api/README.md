# おすすめAPIゲートウェイ（初期状態は無効）

BodyMake の `dev:test` 用ローカル試作と、本番接続を準備するCloudflare Workerです。本番 Firebase Hosting や共有テストに API キーを埋め込みません。Workerの無効状態での配置と、実APIの有効化・本番画面の公開は別です。実記録の外部送信・学習データの保存はまだ行っていません。

## できることと境界

- 端末側で安全条件を満たした固定カタログの候補 ID と6次元特徴、記録済み栄養の集計・欠損フラグのみを受け取ります。氏名、メール、日付、写真、自由文、生の食事／筋トレ記録は受け付けません。未知のフィールドや候補 ID は拒否します。
- OpenAI Responses API に候補の順位だけを問い合わせます。回答は候補内の食事・運動 ID 各0〜3件のみです。栄養値、運動負荷、診断、説明文を生成させません。表示名・理由・栄養値はアプリ内の既存データを使用します。
- `text.format` の厳格な JSON Schema に加え、返答を再検証します。拒否、未完了、時間切れ、不正な ID は成功として扱わず、再試行もしません。
- `store:false` を指定しますが、**OpenAI 側の不正利用監視ログ等の保存がゼロになる保証ではありません**。現在の「学習データは非公開 Drive のみ」という方針と外部送信の扱いを所有者が確認してから、有料接続を別途有効化してください。画面の外部送信への同意と、学習利用への同意は別です。
- ローカル版のセッション・予算予約はRAMのみです。Cloudflare版だけは支出管理用の予約額・不透明なハッシュ／IDを永続保存します。個人記録・写真・API回答をそこへ保存しません。API回答は自動的に学習の正解にはならず、既存food-ai台帳・モデル・写真共有経路とは接続していません。

## 無料の検証・無効状態での起動

リポジトリ指定の Node.js **22.23.4** を使用します。Firebaseトークン検証用の `jose` はpackage-lockに固定し、通常の `npm ci` で取得します。

```bash
npm run test:recommendations
node --experimental-strip-types scripts/recommendation-api/server.ts
```

テストは合成データ・モック API と loopback 通信のみで、実 OpenAI API、実キー、実記録、Drive は使いません。通常起動は無効状態です。ゲートウェイは `127.0.0.1:3004` にだけ bind し、`npm run dev:test` の `http://localhost:3001` または `http://127.0.0.1:3001` だけを許可します。公開版・共有テスト版・LAN・スマホからの利用は対象外です。

## ローカル版の有料接続設定（本番の累計上限には使用不可）

キーは所有者がサーバープロセスの環境へ安全に注入してください。チャット、ソース、ブラウザ、`NEXT_PUBLIC_*`、URL、ログに貼らないでください。このプログラムは `.env.local` や認証ファイルを読みません。

| サーバーだけの環境変数 | 意味 |
| --- | --- |
| `BODYMAKE_RECOMMENDATION_API_ENABLED` | 完全一致 `true` の時だけ有効化を検討。省略時は無効 |
| `OPENAI_API_KEY` | 所有者の適切な OpenAI プロジェクトのキー。出力しない |
| `OPENAI_RECOMMENDATION_MODEL` | 料金・利用可能性・Structured Outputs 対応を確認したモデル ID。既定値なし |
| `BODYMAKE_RECOMMENDATION_SESSION_BUDGET_USD` | このプロセスの予約予算。必須、最大5ドル |
| `BODYMAKE_RECOMMENDATION_RESERVE_USD_PER_CALL` | 1呼び出しごとの保守的な予約額。必須。モデル料金・最大入力／出力から所有者が確認する |
| `BODYMAKE_RECOMMENDATION_MAX_CALLS` | 起動中の最大呼び出し数。既定10、最大100 |
| `BODYMAKE_RECOMMENDATION_MAX_CONCURRENT` | 同時呼び出し数。既定1、最大2 |
| `BODYMAKE_RECOMMENDATION_MAX_OUTPUT_TOKENS` | reasoning を含む出力上限。既定400、最大1024 |
| `BODYMAKE_RECOMMENDATION_TIMEOUT_MS` | 応答待ち上限。既定20000、最大60000 |

不足・不正な設定では失敗側に閉じ、API は無効のままです。リクエスト本体は16,384 bytes／12,000文字以下、候補は固定54件以下に制限します。

**これは API アカウント全体のドル単位ハード上限ではありません。** 予約額は設定された見積もりで、実際のトークン数・請求額・残高を確認していません。誤った低い予約額、料金改定、別プロセスや別アプリからの利用、明示的な再起動はアカウント全体の支出に影響します。呼び出し数・同時数はこのプロセス内でのみ強制します。予算予約は呼び出し前に同時処理に対して不可分に行い、失敗や時間切れでも戻しません（すでに課金された可能性があるため）。**再起動で RAM 上の上限・重複履歴はリセットされます。** 追加クレジット購入・自動チャージやプロバイダ側の予算設定は操作しません。

## 本番の無料枠・累計5ドル制限（準備中・API無効）

所有者の指定は、Cloudflare **Workers Freeの枠内だけ**で動かし、OpenAIは現在のクレジットのうちこのおすすめ機能で**全利用者合計・累計5ドルまで**使うことです。月替わり・再起動・再デプロイで5ドルの予算を補充しません。無料枠超過、予算不足、残高や保存の不明状態では有料APIを呼ばず、端末内の無料候補だけを利用する設計です。有料プランへの変更、支払い情報の登録、有料の代替サービスは行いません。

`cumulative-budget.ts` はこのための独立した予算コアです。正整数のmicroUSD（1ドル＝1,000,000）で、全ユーザー共通の永続台帳への原子的な事前予約を要求します。同じ利用者ハッシュ＋リクエストIDの再送に新しい呼び出し権を与えず、同じIDの入力変更を拒否します。失敗・時間切れ・保存完了の確認不能でも予約を返しません。欠落／破損した台帳は自動で初期化せず、履歴が10,000件に達しても停止します。台帳に記録できるのは予約額と不透明なハッシュ／IDのみで、健康記録やAPI回答は含めません。

Cloudflare版はこのコアとSQLite Durable Objectアダプターを接続しています。2026年11月4日に対象アカウントのWorkers FreeがActive、支払い方法未登録であることを画面で確認しました。`wrangler.jsonc` でAPIを無効にしたまま配置し、実URLのhealthが `enabled:false`、recommendが `api_disabled`、未認証の管理操作が401、許可外Originが403であることを確認しました。これは実APIや本番UIの利用可能性を確認したものではありません。公開前に以下をすべて満たします。

- 対象Cloudflareアカウントの**Workers**プランがFreeであることを実確認する。ドメインのFree表示だけでは代用しない。
- SQLite Durable Objectの単一・固定台帳へ接続し、原子的な保存が確定してからAPIを呼ぶ。未初期化台帳は明示的な初回設定まで停止し、欠落時の再作成や過去の台帳への巻き戻しを行わない。
- Workerを迂回するfail-openルートや有料fallbackを使わない。無料枠エラー、ストア障害、予約不足時のAPI呼び出しが0回であることを確認する。
- Firebase本人認証と同じUIDの記録取得、厳格な入力検証、明示的な外部送信同意を接続する。クラウド取得失敗をローカルのデモ記録で代用しない。
- モデルと料金を固定・確認し、入力全体とreasoningを含む最大出力の保守的な費用上界を予約する。SDK／HTTPの自動再試行を無効化し、1予約につき有料リクエストは最大1回とする。未確認の低い見積もりや月次アラートを累計5ドルの保証にしない。キーはサーバー側だけに保持する。

2026年11月4日の実接続確認では、新規・未使用の固定DOに予算4テーブルを初期化しました。リモートから `limitMicros=5000000`、`reservedMicros=0`、`remainingMicros=5000000`、`reservationCount=0` を取得し、再初期化が409で拒否されることと、同一設定の再デプロイ（版 `3954f907-db65-44bf-a272-cd01288c18f2`）後も同じ値を保持することを確認しました。支出予約を作る検証や実OpenAI呼び出しはしていません。非ゼロ予算・障害・並行処理・クラッシュは合成RAMテストでの検証です。その後 `INITIALIZE_SECRET` を削除し、Secret一覧が空・管理読取が401であることを確認しました。初期化を再実行しないでください。APIは `false` のままです。

Workers Freeはアカウント全体で1日100,000リクエストが上限で、超過時は失敗します。SQLite Durable Objectsも無料枠超過時は該当操作が失敗します。日次枠は00:00 UTC（日本時間09:00）に戻りますが、**OpenAIの累計5ドル台帳は戻しません**。今後アカウントを有料プランへ変更すれば、この無料契約を前提とする保護は維持できません。有効化・運用時もFreeを確認してください。[Workers制限](https://developers.cloudflare.com/workers/platform/limits/)、[Durable Objects料金](https://developers.cloudflare.com/durable-objects/platform/pricing/)、[プランと請求のFAQ](https://developers.cloudflare.com/billing/understand/faq/)

OpenAIのプロジェクト月次上限は補助にはなりますが、月次リセットと反映遅延があるため今回の累計予算の代わりにはしません。このアプリ以外からのAPI利用やクレジットの失効は本機能では制御できません。[OpenAIの利用上限](https://developers.openai.com/api/docs/guides/spend-limits)

### Cloudflare版の接続・運用条件

- Worker名は `bodymake-recommendation-api`、公開受け口は `https://bodymake-recommendation-api.ajimo023.workers.dev`。既存の本番FirebaseサイトはまだこのURLを呼びません。
- 所有者によるキー登録後、2026年11月4日にSecret一覧で `OPENAI_API_KEY` / `secret_text` を確認しました。値は取得せず、実OpenAI呼び出しもしていません。キーの有効性、モデル権限、残クレジットを確認したという意味ではありません。`BODYMAKE_RECOMMENDATION_API_ENABLED=false` を維持します。
- `RECOMMENDATION_BUDGET` のSQLiteクラスと `lifetime-usd5-v1` という全利用者共通のDO名を固定します。別環境・別UID・月別の予算へ分割せず、名前変更、削除、PITR巻き戻し、新規台帳への置換で予算を補充しません。ローカルRAM版へフォールバックしません。
- 予算予約の保存確認に加え、支出前のattemptと、モデル・tier・トークン数を検証できた成功後のcompletionを追記専用で保存します。未確認応答・タイムアウト・クラッシュでcompletionがない場合、再起動後も次の呼び出しを止めます。自動解除・返金・管理用の解除経路はありません。completionの保存ACKを失った場合だけ、実際に残った有効な証跡を次回再検証できれば別リクエストへ進めます。同一リクエストの再支出は許しません。これはAI回答の保存や正解確認ではなく、課金結果確認の運用記録です。
- `INITIALIZE_SECRET` は初回準備の間だけサーバー側へ設定するランダムな秘密です。無効状態の空台帳だけを初期化でき、既存台帳の再初期化は拒否します。保存・再デプロイ後の読取確認が済んだらこの秘密を削除します。キーがない管理経路は401で停止します。
- 最初は `OWNER_UID` と一致するFirebase本人だけを許可します。固定プロジェクト `healthapp-14a3f`、Googleプロバイダ、確認済みメール、RS256署名、期限、失効・無効化をサーバーで確認します。実際のFirebase応答フィールドとAPIキー制限の互換性は未確認で、確認できない場合は停止します。単なるOrigin制限を本人認証の代わりにしません。[Firebaseアカウント情報の仕様](https://firebase.google.com/docs/reference/rest/auth#section-get-account-info)
- サーバー専用設定は `OPENAI_API_KEY`、`OWNER_UID`、`FIREBASE_WEB_API_KEY`、`SUBJECT_HMAC_KEY`、`BODYMAKE_PRICING_VERIFIED_AT`。秘密はCloudflareのSecretに設定し、チャット・Git・ブラウザ側環境変数・ログへ出しません。APIを有効にする設定は初期値 `false` のままです。
- 料金ポリシーは `gpt-5.6-luna`、default tier、出力最大400トークン、reasoning none。指示・JSON Schemaを含む入力全体を覆うため、現在はモデルの最大入力窓全体と料金倍率を使って**1回0.50ドルを事前予約し返金しません**。最大10回で停止し、通常は実請求が5ドルになるよりかなり早く停止します。実支出や残クレジットを測っているという意味ではありません。[公式モデル仕様](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
- `BODYMAKE_PRICING_VERIFIED_AT` は所有者が現在の料金とアカウント固有条件を確認した時刻です。24時間経過・未設定・未来日時で停止し、自動更新しません。利用可能モデル、100ドルのクレジット残高・期限、契約固有の料金はまだ実確認していません。公開単価だけでこれらを推測しません。
- `readFirebaseRecommendationRecords` を本番向け画面へ接続しました（未公開・実通信未確認）。本番Firebase構成と正確な本番Originだけを許可します。記録取得失敗をデモ記録や「0件」で代用せず、API送信は毎回別途同意を必要とします。UIDを画面の生存期間中固定し、ログアウトや一時的な別アカウントへの切り替えでも候補・同意を失効させます。送信前／回答表示前に最新記録を取得し、条件が変わっていれば回答を破棄します。ブラウザの自動再送や本番からローカルAPIへのfallbackはありません。

### 本番画面の非課金接続確認

`GET /session` は正確な本番OriginとFirebase IDトークンを要求し、所有者認証だけを実行します。API無効時は本人に限り `{authorized:true,enabled:false}` を返し、予算台帳やOpenAIへ触れません。有効時は料金期限・既存台帳・残予算・未確認実行を読み取り確認してから `enabled:true` とします。これは次のリクエストの支出枠を予約せず、実際の送信時に同じ条件を再検証します。トークン・UID・記録は応答しません。公開 `/health` は非課金の準備確認のままで、AI利用可否の判断には使いません。

本番画面の公開には対象PRの確認・承認と本番ビルドが必要です。所有者UIDの指定、Firebase実認証の互換性、OpenAIのクレジット／料金条件、無料契約を確認する前にAPIを有効化しません。

2026年11月4日に非課金の接続確認経路を無効状態のWorkerへ配置しました（版 `719f268f-e5d9-46a1-bb74-f3d10099f491`）。実URLで `/health` が200・`enabled:false`、`/session` が503・`auth_not_configured`、`/recommend` が503・`api_disabled`、未認証 `/admin/budget` が401であることを確認しました。所有者設定の完了・予算残高の再取得・Firebase／OpenAIの実通信成功を確認したものではありません。

## ローカル版のブラウザとの契約

全エンドポイントは正確な loopback `Host` と上記 `Origin` が必要です。Origin がないアクセスや任意の Web サイトは拒否します。サービスは OS 内の悪意あるローカルプログラムからの隔離や本番認証を代替しません。

1. 明示操作で `GET /health`。`{enabled,reason,remainingCalls,sessionBudgetUsd,reservedBudgetUsd}` を返します。未設定予算は `null` です。キー・モデル・個人データは返しません。
2. `GET /session`。ランダムな `{token,expiresAt}` を返します。トークンはブラウザの RAM のみで保持します。30分、有効セッション最大4つ、発行 Origin に固定します。同じ Origin からの再要求では期限内のトークンを再利用し、期限や呼び出し上限は延長しません。
3. `POST /recommend`。`Authorization: Bearer <session token>` と JSON `{requestId:<UUID>,transferConsent:true,request:<RecommendationRequest>}` が必要です。
4. 成功時は `{source:"openai",model,requestId,mealIds,workoutIds}`。失敗時は `{error:<固定コード>}` だけです。プロバイダの生エラー・キー・入力は漏らしません。

同じ UUID と同じ正規化された入力は、処理中／成功／失敗の応答を RAM から再利用し、再課金につながる呼び出しを行いません。同じ UUID に別入力を与えると409です。UUID は外部サービスに送信しません。別 UUID、別プロセス、再起動後の重複を防ぐ永続台帳ではありません。画面は自動再試行せず、記録変更時に古い応答を破棄してください。

主な失敗コード: `api_disabled`、`session_required`、`consent_required`、`invalid_request`、`unsafe_candidates`、`request_id_conflict`、`request_limit_reached`、`session_budget_reached`、`request_in_progress`、`provider_refusal`、`provider_incomplete`、`provider_bad_output`、`provider_failed`、`provider_timeout`。

## 公式仕様

- [Structured Outputs / Responses API](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)
- [Responses API への移行](https://developers.openai.com/api/docs/guides/migrate-to-responses)
- [API のデータ保持](https://developers.openai.com/api/docs/guides/your-data)

有効化前に現在のモデル提供状況・料金・利用規約と、学習への回答利用条件を改めて確認してください。API を呼ぶだけでは自作モデルは学習しません。
