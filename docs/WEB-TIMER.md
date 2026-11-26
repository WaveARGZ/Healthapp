# BodyMakeのWebタイマー

休憩タイマーと有酸素の経過時間は、ログイン後の記録画面に共通のProviderで管理します。筋トレ・食事・ホームなどの画面切り替えや同じタブの再選択で計測をリセットしません。計測中・一時停止中・休憩終了時には上部バーから時間確認、一時停止・再開、終了ができます。モバイルのキーボード入力・モーダル表示中は上部バーを隠し、セット編集画面内の既存タイマーを利用します。

時間は毎回の描画回数ではなく開始時刻と現在時刻の差で計算します。別アプリから戻ったときは `visibilitychange` / `pageshow` で更新し、ブラウザがタイマー処理を停止していた期間も経過時間へ反映します。ページ自体の再読み込み・終了や、ログイン画面への移動は計測終了になります。状態を個人記録やサーバーへ保存しません。

「計測中は画面の自動消灯を防ぐ」は任意・既定オフです。対応環境のScreen Wake Lockを計測中だけ取得し、一時停止・終了・背景移動・アンマウント時に解放します。画面復帰時には必要なら再取得します。未対応、低電力、OSによる解除・拒否を正常な成功として表示しません。画面点灯によるバッテリー消費が増えます。

**Web版の限界:** iPhoneのロック画面や他アプリ上へBodyMakeのタイマーを常時表示する機能はありません。iOSがWebページや音声を停止するため、バックグラウンド・ロック中の終了音も保証しません。休憩終了時は、利用者が許可した場合に限りWeb Pushで通知できます。通知の設定と制限は [Web Push通知](../scripts/timer-push/README.md) を参照してください。無音音声による背景維持や標準「時計」への切り替えは追加しません。PR #67のショートカット連携は所有者の希望と異なるため撤去しました。

検証は `npm run test:workout-timer` と `npm run test:mobile-viewport`。音声セッション復元、休憩・有酸素の画面復帰、Wake Lockの任意取得・解放・拒否・遅延完了をRAMで確認します。実iPhoneの音声・省電力・画面の自動消灯については別途実機確認が必要です。

一次資料:

- [WebKit: バックグラウンドの処理制限](https://webkit.org/blog/8970/how-web-content-can-affect-power-usage/)
- [WebKit: Safari 18.4のScreen Wake Lock対応](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/)
- [MDN: Screen Wake Lockの取得と解放](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API)
