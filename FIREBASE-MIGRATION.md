# Firebase移行の準備と切り替え手順

2026年10月11日現在、既存の **Healthapp（`healthapp-14a3f`）** をSparkプランのまま利用し、Google認証・東京リージョンのFirestore・Webアプリ登録・個人別のFirestoreルール・Firebase Hostingへの公開を完了しました。公開先は [BodyMake](https://healthapp-14a3f.web.app/) です。ルートURLは `/bodymake/` に転送し、ポートフォリオ画面は削除しました。Googleログイン後にプロフィール入力画面へ進むことと、再読み込み後もログイン状態が続くことを確認しました。プロフィールや記録のFirebaseへの実保存と、旧AWS記録のFirebaseへの移行は未確認です。旧AWSリソースは削除済みで、GitHub Pages版の公開設定は変更していません。

## 接続済みの設定

- プロジェクトID: `healthapp-14a3f`、料金プラン: Spark、Firestore: Standard・`asia-northeast1`
- Webアプリ: `BodyMake Web`、Googleログイン: 有効
- 承認済みドメイン: `localhost`、`healthapp-14a3f.firebaseapp.com`、`healthapp-14a3f.web.app`
- スマホのGoogleログインはFirebase Hostingと同じ `healthapp-14a3f.web.app` を `NEXT_PUBLIC_BODYMAKE_FIREBASE_MOBILE_AUTH_DOMAIN` に設定し、Google OAuthクライアントのリダイレクトURI `https://healthapp-14a3f.web.app/__/auth/handler` を承認する。PC用の `NEXT_PUBLIC_BODYMAKE_FIREBASE_AUTH_DOMAIN` は従来の `healthapp-14a3f.firebaseapp.com` のまま使う。ログイン画面ではリダイレクト復帰後のユーザー状態を確認する。
- ローカルの公開Web設定: Git管理対象外の `.env.local`。管理者秘密鍵やサービスアカウント鍵は使用しない
- デプロイ: `firebase deploy --only firestore:rules --project healthapp-14a3f`、`npm run build`、`firebase deploy --only hosting --project healthapp-14a3f`

本人のプロフィールと記録は、公開URLでログイン後に登録できます。既存のAWS/Cognitoや別URLの端末内データは自動移行されません。

## 保存先と安全策

| データ | Firebase版の保存先 |
| --- | --- |
| Googleログイン | Firebase Authentication |
| プロフィール、筋トレ、食事、体重、器具・お気に入り | Firestoreの `users/{uid}/...` |
| 身体の正面・背面写真 | 端末のブラウザ内IndexedDBのみ。クラウドへ送らない |
| 食事写真と修正学習データ | 通常の食事記録とは別。明示同意した共有のみ、既存のDriveフロー（設定済みの場合） |

Firestoreルールはログインした本人の `uid` 配下だけ読み書きを許可する。未ログイン・他人の領域・それ以外のパスは拒否する。端末内の身体写真も `uid` ごとに分離するが、同じ端末のブラウザデータを消すと失われる。写真は必要ならアプリから画像として保存しておく。

**Sparkは無制限ではない。** 無料枠を超えると対象サービスが利用できなくなる場合がある。請求先をリンクしなければ従量課金に切り替わらないが、利用不能を避けるためFirebase Consoleの使用量を確認する。Cloud Storage、Cloud Functions、Firebase App Hosting、有料AI APIはこの構成で使わない。静的な**Firebase Hosting**だけを使う。

## 今後の確認

1. 公開URLで本人のプロフィール、筋トレ、食事、体重を少量登録し、再読込後も残ることと、別端末で同じGoogleアカウントなら読めることを確認する。別アカウント・未ログインで読めないことも確認する。
2. テスト環境でクラウド保存を試す場合は別のFirebaseプロジェクトを作り、`NEXT_PUBLIC_BODYMAKE_TEST_*` に接続する。本番と同じプロジェクトIDはテスト用として拒否する。現時点の3001番は端末内保存のまま。
3. GitHub PagesをFirebase版へ置き換える場合は、GitHub Actionsの環境変数と認証済みドメインを別途更新する。現在のFirebase公開URLは `https://healthapp-14a3f.web.app/`（`/bodymake/` へ転送）。
   食事の修正データを既存のGoogle Driveへ共有する機能も継続利用する場合、別途そのGoogle OAuthクライアントの「承認済みのJavaScript生成元」に新しいHosting URLを追加し、共有受け口の許可元も確認する。FirebaseログインだけではDriveへの送信権限は得られない。
4. **旧AWS記録が必要なら個別に復元・移行する。** AWS/CognitoのユーザーIDとFirebaseのGoogle UIDは異なり、自動では移らない。削除前にDynamoDBの2テーブル各3件とCognitoユーザー2件のメタデータを非公開のローカルバックアップへ保存した。詳細は下記を参照。旧S3写真バケットは空だった。Cognitoのパスワードはエクスポートできず、旧アカウントをそのまま再開することはできない。

## 旧AWS環境の削除と復旧用資料

2026年10月11日に東京リージョンの `bodymake-production` スタックを削除した。スタック削除時に保持される設定だったDynamoDBの2テーブル、Cognitoユーザープール、空の身体写真S3バケットも個別に削除した。API、Lambda、監視ルール、SNS、CloudWatchロググループ、スタックのAWS Budgets通知も残っていないことを確認した。AWSアカウント自体と、将来の再構築に使えるIAMユーザー `bodymake-deployer` は残している。

削除前の記録とデプロイ済みテンプレートは `.private-backups/aws-bodymake-production-2026-10-11/` に保存した。このディレクトリはGitの対象外で、個人情報を含むため公開・共有しないこと。復旧用のSAMテンプレートとアプリコードは `backend/` に残しているが、再デプロイするとリソースIDやCognito設定は新しくなる。旧データの取り込み、Googleログインの再設定、Firebaseアカウントとの対応付けは別途必要。過去利用分の請求は削除後に遅れて計上される場合があり、AWSアカウント全体の課金停止を保証するものではない。

## 切り替え前の注意

- `.env.local` にFirebaseの設定を入れただけでは公開サイトは変わらない。GitHub Pagesの旧AWS接続設定は自動更新されないため、旧APIを参照する公開ビルドは動作しない。
- Firebase版を選択して設定が不足するとログイン画面に未設定と表示し、デモ保存へは切り替わらない。
- FirebaseのGoogleログインで作られるアカウントは、Cognitoの既存ユーザーとは別物。旧AWS記録はFirebaseへ自動移行されていない。
- 無料枠や対象機能の条件は変わり得るため、導入直前に[Firebase料金プラン](https://firebase.google.com/pricing)を再確認する。
