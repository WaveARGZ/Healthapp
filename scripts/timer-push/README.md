# 休憩タイマーのWeb Push通知

iOS 16.4以降でホーム画面に追加したBodyMakeを対象に、利用者の操作で通知を許可した場合だけ、休憩終了時に通知を送る。Apple Developer Programへの加入は必要ない。タイマーを開始して「終了通知を予約しました」の表示を確認してから他の画面に移る。通知には「休憩タイマーが終了しました」だけを表示し、健康記録・食事・アカウント情報は入れない。

サーバーは独立したCloudflare WorkerとSQLite Durable Objectで構成する。既存アドバイス用Workerや課金・予算台帳は使わない。Firebase本人認証後、ログイン利用者とタブ単位のランダム識別子から予約先を決定する。AppleのHTTPS Web Push endpoint・終了時刻・操作の通し番号を一時保存し、他ドメインへの送信、古い開始要求、本文・不正な日時を拒否する。Appleへは内容なしの通知を送信し、端末側Service Workerが固定文言を表示する。通知先の秘密URL、IDトークン、UID、API鍵をログやGitに出さない。予約の消費・取消後、古い要求が遅延到着しても復活しないよう番号を25時間保持し、期限後に削除する。

休憩タイマーの開始・再開で予約、一時停止・リセット・通知オフで取り消す。最新操作の番号が古いリクエストを上書きする。再読み込み時はページ内のタイマーがリセットされるので同一タブの以前の予約を取り消し、通知は再度オンにする。予約は24時間以内、予約要求は1ユーザー1日200件・全体1日4000件まで。超過・通信/認証失敗は予約失敗として表示する。取消要求はこれらの予約制限の対象外。Cloudflare Workers Freeの上限を超えた場合も停止し、有料プランには切り替えない。

通知はApple・ネットワーク・iOSの設定、集中モード等に影響される。受付は端末での受信を保証せず、遅延が1分超なら誤通知を避けて送信しない。送信結果が不明な場合の二重通知を避けるため、送信開始後の失敗を自動再送しない。停止操作がネットワーク障害でサーバーへ届かない場合、あるいは既に送信が始まった場合、古い通知が届くことがある。ページを閉じている間もWeb Pushは届きうるが、OSや通信は保証しない。

設定: `NEXT_PUBLIC_BODYMAKE_TIMER_PUSH_URL=https://bodymake-timer-push.ajimo023.workers.dev` を明示した本番Firebaseビルドだけ有効。既定・ローカルテスト・共有テストでは通知機能を有効にしない。サーバーの `FIREBASE_WEB_API_KEY`、`VAPID_JWK`、`VAPID_PUBLIC_KEY` は実行環境の設定として管理し、private JWKやトークンをGit・ログ・この文書に記録しない。鍵を変えると既存の端末購読を再登録する必要がある。

検証: `npm run test:timer-push` と `npm run test:workout-timer`。前者は合成鍵・合成端点を使用し、拒否・別ユーザー分離・古い予約・取消・再試行・利用制限・署名をRAMで検証する。`wrangler.local-test.jsonc` と `local-harness.ts` は合成認証専用のローカル検証であり、絶対に公開しない。モックやローカルテストはiPhoneへの実配信確認ではない。

資料: [Apple Web Push](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)、[Cloudflare Alarms](https://developers.cloudflare.com/durable-objects/api/alarms/)、[Workers Freeの制限](https://developers.cloudflare.com/durable-objects/platform/pricing/)。
