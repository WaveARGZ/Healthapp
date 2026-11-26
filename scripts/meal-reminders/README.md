# 共有テストの食事記録リマインダー

設定の「食事の記録リマインダー」から「食事の通知をオンにする」を選んだ端末に、日本時間8時・12時・19時に、それぞれ朝食・昼食・夕食の記録がない場合だけ通知します。iPhoneとiPadはホーム画面に追加したBodyMakeを開いて許可します。通知の表示や音は端末の通知設定に従います。

通知を許可する操作で、共有テストのGoogleログインと参加者一覧を確認します。端末ごとの予約には配信先、ユーザーID、参加資格の再確認に使う確認済みメールアドレスを保存します。解除、参加資格の失効、配信先の無効化を確認したときに予約を削除します。通知時刻に参加資格を確認し、共有テストFirestoreから該当日の食事の登録有無だけを取得します。通知の内容は食事の区分と登録の案内です。参加資格や記録状態を確認できない回や、配信の開始が2分を超えて遅れた回は、次の食事時間まで見送ります。

## 配信の準備

- チーム承認済みのCloudflare Workers Freeアカウントで、共有テスト専用の `bodymake-test-meal-reminders` Workerを用意します。
- Workerの `MEAL_VAPID_KEYS` シークレットに `publicKey` と `privateKey` のJSONを設定します。
- 共有テストのプロジェクト `bodymake-test-14a3f` 内に、Firestore読み取り専用のサービスアカウントを用意します。アカウントの `client_email` と `private_key` をWorkerの `MEAL_READER_CREDENTIALS` シークレットに設定します。参加資格と食事の登録有無の照会に必要な権限は `datastore.entities.get` と `datastore.entities.list` です。これらのIAM権限はデータベース単位で適用されるため、共有テストプロジェクトのデータベースに範囲を絞って承認を受けます。秘密鍵は実行環境のシークレットだけで管理します。
- 共有テスト用のGitHub変数 `BODYMAKE_TEST_MEAL_REMINDER_ORIGIN` に `https://bodymake-test-meal-reminders.<チームのサブドメイン>.workers.dev` を設定し、共有テストを再ビルドします。

検証は `npm ci --prefix scripts/meal-reminders` と `npm test --prefix scripts/meal-reminders` で実行します。ブラウザーやデータベースへの通信は、テスト内で模擬します。

実配信の有効化時は、承認済みのテストアカウントで参加資格と食事の登録有無の両方を照会できることを確認します。そのアカウントで、記録のある食事は通知されず、未登録の食事だけが端末に通知されることを確認します。
