# 共有テスト用の休憩タイマー通知

このWorkerは `bodymake-test-14a3f.web.app` だけを受け付けます。通知の予約には、テストFirebaseでGoogle認証済みかつ `developerAccess` で有効な利用者のIDトークンが必要です。予約に保存する情報は終了時刻と通知の送信先です。配信または取消後は通知の送信先を破棄します。

チーム承認済みのWorkers Freeアカウントを使用します。VAPID鍵ペアはこのWorkerの `REST_VAPID_KEYS` シークレットに置き、JSONの項目名を `publicKey` と `privateKey` にします。公開後、GitHubリポジトリの `BODYMAKE_TEST_TIMER_PUSH_ORIGIN` 変数に `https://bodymake-test-rest-notifications.<チームのサブドメイン>.workers.dev` を設定して、共有テストを再ビルドします。変数が空の場合は端末内のタイマー通知が使われます。

検証は `npm ci --prefix scripts/workout-timer-push` と `npm test --prefix scripts/workout-timer-push` で実行します。テストで通知を外部へ送信することはありません。
