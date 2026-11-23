# ホームのChatGPTアドバイス

食事・完了した筋トレの直近7日間、目標、今日の分割メニューと使用可能な器具をもとに、次の食事・筋トレ・回復の案を表示する。写真認識の追加学習とは独立した機能。

**現在は生成無効。2026-11-23に所有者の請求画面で、利用可能な既存クレジット100ドル・11月30日の有効期限・有料請求プラン未開始を確認した。CloudflareもWorkers Freeを確認した。既存Workerへ生成無効のコードを更新し、モデル情報をGETする読み取り接続検査だけを実施した。既存APIキーを使用した検査はOpenAIからHTTP 401（認証情報に関する拒否）が返り、同じ課金先へ接続できることは未確認。Responses APIによる生成・クレジット消費の確認・予算の移行・有効化・本番Hostingへの公開は未実施。** クレジット購入処理は存在しない。APIキーは既存Cloudflare secretだけで管理し、ブラウザやGitに含めない。

## 操作と個人情報

1. 本番でGoogleログインした所有者本人が記録確認ボタンを押す。
2. 本人のFirestore記録をサーバーから読む。キャッシュへの切替、デモとの混合、読込失敗時の空履歴への置換はしない。
3. 送信要約を表示し、毎回のチェックボックスで同意を得る。送信前後に記録とアカウントを再確認する。変わっていたら回答を表示しない。
4. サーバーからResponses APIへ1回だけ送る。store:false。ツール・会話ID・写真・ファイル・自動再試行は使わない。
5. 構造・器具適合性を検証してテキスト表示する。記録への自動書込みはしない。要約と回答はRAMのみ。アカウント変更・画面離脱で保持しない。

未入力栄養素はnull、明示的な0は0。複数料理の一部が不明なら、その栄養の合計も不明。未完了セット・未来・期間外の記録は使わない。自由入力欄には氏名・連絡先を入れない。診断・強制的減量・食事の埋め合わせ運動を求めず、成人プロフィール未確認なら個別の減量量・負荷を出さない。

## 10ドル通知と利用枠

所有者指定は **10ドルで通知し、利用は継続**。10ドルは停止上限ではない。ホームにこの機能の累計利用額の概算を表示し、10ドル以上で通知する。メール・OS通知は実装していない。ブラウザ・月・デプロイ・利用者を替えても累計は初期化しない。

請求画面の残高とこの概算は別物。他のAPI利用額・税金・為替・付与クレジット残高を推測しない。入力はキャッシュ書込みの最高単価で保守的に計算するため、請求額より早めに通知する場合がある。

呼び出し前に、モデル入力上限全体・長文料金・出力上限を覆う0.25ドルを同じDurable Objectへ予約する。確認できたusageだけ精算し、失敗・不明なら予約を維持して以後の有料呼び出しを停止する。重複IDを拒否。30秒に1回・24時間に20回。既存Workers Freeの枠内で動作し、有料プランに切り替えない。

既存の lifetime-usd5-v1 の名前・クラス・namespaceを維持する。旧5ドル台帳と全履歴を検証して読み取り、予約済み額をv2へ繰り越す。v1テーブルは変更・削除しない。v2の3テーブルへ追記する。欠損・不整合・未確認の旧呼び出しは移行不可。再初期化、旧予算への巻戻し、消費枠の復活は行わない。

## 有効化前の確認（未完了）

- キーが属する組織・プロジェクトとクレジット付与先が一致すること。ChatGPT契約額やキーの存在だけでは証明できない。
- 実際の残高・付与種別・有効期限・自動追加購入オフ・クレジット外の後払いなし。他のAPI利用で残高を共有する場合、その消費も確認する。
- OpenAIの停止には遅延があるため残高ぎりぎりまで使わない。この機能へ確保できる既存クレジットから余裕を差し引いて割り当てる。残高表示だけで追加課金ゼロと断定しない。
- 既存Cloudflareプラン、旧台帳の実状態、通常のFirebase本人認証、実APIの応答形式と料金を順に検証する。実API試験も割当枠へ計上する。

サーバー設定は OWNER_UID / FIREBASE_WEB_API_KEY / SUBJECT_HMAC_KEY / 既存OPENAI_API_KEY。課金条件の監査後だけ CREDIT_NO_ADDITIONAL_CHARGE_CONFIRMED=true、CREDIT_ALLOCATION_MICROS（USDの百万分の一、最大100ドル）、CREDIT_VERIFIED_AT、CREDIT_VALID_UNTIL と実際に確認した OPENAI_ORGANIZATION_ID / OPENAI_PROJECT_ID を設定する。この組織・プロジェクトをAPIのリクエストヘッダーへ固定し、応答の組織IDも照合する。残高を100ドルと仮定する既定値はない。残高確認は24時間で失効し、再確認が必要。時刻だけ延長しない。価格表の再確認期限は2026-12-23。

無効状態のまま一時的な INITIALIZE_SECRET で /admin/provider-check を確認する。この経路は同じ既存secret・固定組織／プロジェクトでモデル情報をGETし、応答の組織を照合するだけで、文章生成・個人記録の送信・予算変更は行わない。残高や実APIの利用成功をこの結果だけで認定しない。接続確認後に /admin/credit-init で一度だけ移行し、管理用secretを削除する。/admin/budget は認証付きの集計値のみ。課金条件を実際に確認してからサーバーの BODYMAKE_ADVICE_ENABLED=true と本番ビルドの NEXT_PUBLIC_BODYMAKE_ADVICE_ENABLED=true を設定する。テストビルドは常にAPIを呼ばない。現在の変更では両方無効。手順書自体を有効化の許可とみなさない。

認証エラー時は生成を試さず、既存キーが有効か・所有者の同じ組織とプロジェクトに属するかを通常の所有者画面で確認する。診断結果は固定の分類だけを返し、APIからのエラーメッセージやキーを表示しない。作業中断時も一時的な INITIALIZE_SECRET を削除する。Workersでは redirect:"error" が通信前に例外となるため、redirect:"manual" と非2xx拒否を組み合わせる。転送先へキーや本人トークンを送らない。

2026-11-23の確認では、アクセシビリティ許可は有効になったが、その後のMac自動ロックで所有者画面の確認を継続できなかった。一時的な INITIALIZE_SECRET は削除済み。元の OPENAI_API_KEY と旧台帳を保持し、生成無効のまま中断した。次回は通常の画面操作が可能になってから認証と課金先の一致を確認する。ロックや認証を迂回しない。

## 検証

Node22.23.4 / npm10で npm run test:advice、npm run lint、npm run build:test。認証・HTTP・SQLiteはRAM/モック。実写真・Firestore書込み・Drive送信・有料API呼び出しは使用しない。ローカルnpm ciは容量不足で失敗し、同一lockの既存依存をAPFS複製、追加joseのみ同じ固定版から使用。GitHub CIはクリーンなnpm ciを行う。

2026-11-23のコード検証はRAM/モック167件、lint、型検査、build:test、test:environment-build、Workerの公開しないバンドル検証が合格。接続確認経路の追加後にはRAM/モック・lint・型検査・Workerバンドルを再検証した。実際のworkerdで通信設定の不一致を再現し、修正後のWorkerバンドルは架空キーに対する認証拒否まで到達することを確認した。実APIの読み取り検査は上記の認証エラーで停止。画面は合成記録を使い、同意前の生成0回・同意後1回、10ドル通知後の継続、未入力と0、アカウント切替時の消去、幅320/390/1024pxを確認した。実API・実記録での提案品質と課金照合は未検証。

一次資料（2026-11-23確認）：[OpenAIモデル料金](https://developers.openai.com/api/docs/models/gpt-6-luna)、[Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)、[クレジットと自動追加購入](https://help.openai.com/en/articles/8264644-setting-up-and-managing-prepaid-api-billing)、[特典クレジットの付与先と期限](https://help.openai.com/en/articles/20001626-api-credits-benefit-for-eligible-chatgpt-subscriptions)、[Durable Object SQLite](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)。
