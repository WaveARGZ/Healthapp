# 共有テスト環境の参加者制限

対象は独立した Firebase プロジェクト `bodymake-test-14a3f` だけです。本番用の `firestore.rules` は変更せず、テスト用構成から `firestore.test.rules` を指定します。

## アクセス条件

Google でログインし、Firebase のトークンに確認済みメールアドレスがあり、テスト用 Firestore の `developerAccess/{email}` に `enabled: true` がある利用者だけ、自分の `users/{uid}` 以下を読み書きできます。登録が空の間は全員の記録アクセスを拒否します。

`{email}` は Google ログイン後の Firebase ID トークンに入る正確なメールアドレスです。勝手な別名変換や小文字変換はしません。実際の 3 人分のアドレスは管理者がテスト用 Firestore に登録し、Git・GitHub の変数・公開 JavaScript・README には記載しません。

各利用者は自分の `developerAccess/{email}` を単件取得できます。未登録・無効を画面で説明するためのものです。他の参加者の登録、登録一覧、登録の追加・変更・削除はブラウザからアクセスできません。管理者が `enabled: false` にすると、既存のログインでも以後の記録の読み書きを拒否します。

この制限は Firestore の記録を守ります。静的 Hosting の HTML・JavaScript・URL 自体を非公開にはしません。未招待の Google アカウントが Firebase Authentication に初回登録される可能性はありますが、記録へアクセスする権限は付与されません。参加者同士も個人の記録を相互閲覧できません。

## 管理者による初回登録

所有者が確認した 3 人のアドレスだけを登録します。Firestore コンソールで、プロジェクトが `bodymake-test-14a3f` であることを確認し、`(default)` データベースに次の形式で作成します。

- コレクション: `developerAccess`
- ドキュメント ID: 本人の確認済み Google メールアドレス
- フィールド: `enabled`、型は boolean、値は `true`

自動登録する場合は管理者の既存の認証をメモリ内だけで使い、Firestore REST API の `projects/bodymake-test-14a3f/databases/(default)/documents:commit` に `currentDocument.exists: false` 付きの `update` をまとめて送信できます。各 `update.name` は上記プロジェクトの `developerAccess/{email}`、`update.fields.enabled.booleanValue` は `true` です。初回作成限定の条件により既存登録を上書きしません。再実行前に既存の 3 件と内容を確認し、失効した登録を無断で再有効化しません。

管理 API は Google OAuth の管理者認証と IAM で認可され、通常のブラウザ用 Security Rules を通りません。実装時は対象プロジェクト ID を固定し、本番 ID を拒否し、アクセストークン・実メール・API レスポンス全文をログや Git に出しません。登録後は完全な 3 件の内容を管理 API で照合し、表示する結果は件数・有効状態に留めます。本番ユーザーや個人記録のコピーは不要です。

参照: [Firestore REST 認証](https://firebase.google.com/docs/firestore/use-rest-api)、[commit API](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/commit)、[Security Rules の認証情報](https://firebase.google.com/docs/rules/rules-and-auth)。

## ルールのローカル検証

`scripts/test-firestore-access.mjs` は実際の Firestore Emulator でルールを評価します。実在しない `demo-bodymake-test` プロジェクトと `example.invalid` の合成アカウントだけを使い、環境変数やアプリから Google の認証・本番設定を読みません。接続先が明示された localhost / 127.0.0.1 以外なら停止します。

Java と Firebase CLI の Firestore Emulator を準備し、`firestore.test.rules` を読み込むエミュレーターを起動してから、次を実行します（8185 は例）。

エミュレーターのプロジェクト ID も `demo-bodymake-test` にします。既存 JAR を直接使う場合の起動例です。JAR のパスは各自のインストール先を指定してください。`--import-data` や `--export-on-exit` は指定しません。日本語 Java の一部エミュレーター版で権限拒否時のメッセージ生成が失敗するため、検証用 JVM の言語だけ英語に固定します。

```bash
java -Duser.language=en -Duser.country=US -jar /path/to/cloud-firestore-emulator.jar --host 127.0.0.1 --port 8185 --project_id demo-bodymake-test --single_project_mode true --single_project_mode_error true --rules firestore.test.rules
```

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8185 node --test scripts/test-firestore-access.mjs
```

PowerShell では次のように指定できます。

```powershell
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8185'
node --test scripts/test-firestore-access.mjs
```

テストは上記エミュレーターの `demo-bodymake-test` のみを初期化します。3 人の本人領域での追加・取得・更新・一覧・削除、空の許可リスト、未招待、未認証、未確認メール、Google 以外の認証、他人領域、許可リストの列挙・自己昇格・無効化後のアクセスを検証します。Firebase の実プロジェクト・本番写真・学習データは使いません。
