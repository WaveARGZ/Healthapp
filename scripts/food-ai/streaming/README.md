# Drive直接入出力の食事写真学習（手動起動）

実装：2026-10-15。**Drive専用認証、新フォルダ構成の初期作成、所有者限定・親階層・容量確認、プログラムからの検証JSON直接アップロードと完全再取得SHA-256一致を実確認しました。稼働Apps Scriptのv3反映、実利用者写真の送信、実CLIPの統合評価は未完了です。精度改善を実証したものではありません。** 本番モデル・本番Hosting・旧Driveアーカイブは変更していません。検証記録はfoodDBの `05_models_and_reports/training_logs/streaming-integration-20261015.json` にあります。

## 起動

リポジトリで `npm run food-ai:launcher` を実行し、http://127.0.0.1:3002/ を開きます。3001は既存のアプリ、3002は開発者専用の学習管理画面、3003は同時実行防止のローカルソケットです。PC起動時の自動学習や定期実行は登録しません。

- 「接続だけ確認」：認証・親フォルダ・所有者限定・容量・旧転送キューを確認。読み取りのみ。新しい構成のフォルダが未作成なら「Drive接続済み・初期設定待ち」と表示し、作成せず終了します。
- 「自律データ収集・学習を開始」：foodDB配下に必要な構成を作成し、取得・検品・特徴量抽出・補正器学習・評価を実行。
- 「安全に停止」：現在の通信とRAM内バッチのDrive保存が完了した境界で停止。初回モデル読込中は時間がかかります。強制終了・電源断では未保存バッチが失われますが、保存済み原本は保持します。
- 「未確認の写真を開く」：Drive上の写真をRAMから表示。実画像を確認して料理を選んだ場合のみ、確認履歴をDriveに保存。食品以外・不明なものは除外。

Python依存は `requirements.txt`、Node依存は既存package-lockを使用。このPCではインストール済みなので追加インストールしていません。別環境でインストールする場合、ライブラリ自体のディスク容量は別途必要です。

## Driveの認証（初回の作業が必要）

ChatGPT/CodexのDriveコネクタ認証は、起動したPythonプログラムへ自動的には引き継がれません。学習プログラム用ADCを別途設定します。

所有者のGoogleアカウントでDriveスコープ付きADCを設定します。自分のGCPプロジェクトで **デスクトップアプリ用OAuthクライアント** を作り、そのJSONをリポジトリ外に保管します。アプリのWeb用クライアント・Firebase認証設定を削除／変更する必要はありません。

```sh
gcloud auth application-default login --client-id-file=/絶対パス/desktop-client.json --scopes=https://www.googleapis.com/auth/drive
```

この操作だけは認証用の小さいJSONをPCへ保存します。**学習データの保存ではありませんが、認証情報の永続保存を望まない場合は実行せず、メモリ限定OAuthの追加対応が必要です。** 認証JSON、アクセストークン、シークレットをチャットやGitへ貼らないでください。Drive APIが無効なら同じOAuthプロジェクトで有効化が必要です。プログラムは認証・API有効化・料金プラン変更を自動実行しません。

このPCのgcloudでは上記コマンドが追加の`cloud-platform`スコープを要求して停止することを確認しました。その場合、権限を広げず、Google公式OAuthライブラリを使う初回認証ヘルパーでDriveだけを認証します。Google Cloud CLIに既に同梱されたライブラリを使う例（SDKの配置は環境により異なります）：

```sh
python3 -B scripts/food-ai/streaming/authorize_drive.py \
  --client-file=/絶対パス/desktop-client.json \
  --google-sdk-third-party=/opt/homebrew/share/google-cloud-sdk/lib/third_party
```

所有者がブラウザで許可すると、`.config/gcloud/application_default_credentials.json`をホームディレクトリ内へ所有者のみ読み書き可能な権限で新規作成します。既存ADCは上書きしません。認可コードはloopback+PKCEで受け取り、チャットへの貼り付けは不要です。保存成功とfoodDBへの実接続成功は別なので、続けて読み取り確認が必要です。GoogleのDrive権限自体はfoodDBだけに限定されず、保存先の制限はプログラム側の親階層検証で行います。

Google側が「外部・テスト中」の場合、許可するアカウントを「対象」のテストユーザーに追加する必要があります。Driveスコープで発行した更新トークンはこの設定では7日で期限切れになるため、長期運用前に公開ステータス・審査要件を別途確認してください。自動で公開設定を変更することはありません。[Google公式のトークン期限](https://developers.google.com/identity/protocols/oauth2#expiration)

[Google公式のADCとDriveスコープの説明](https://docs.cloud.google.com/docs/authentication/application-default-credentials#personal)

## 保存・RAMの境界

- Drive for Desktop/rcloneマウントは使いません。ストリーミングマウントでもローカルキャッシュが発生するためです。
- 画像は1枚ずつ、JPEG・特徴量・npz・ログ・モデルはBytesIO/Blob/配列で処理し、Drive REST APIに直接渡します。モデル資材もDriveカスタムキャッシュ。TransformersのFSキャッシュ・ブラウザキャッシュ・local-model読込はworkerで無効化。
- 全アップロードで所有者のみの権限・foodDBへの親階層・容量を検証し、実際の完全再ダウンロードのSHA-256を比較します。同名同内容は再アップロードしません。異なる内容の同名ファイルは、更新を明示したキャッシュ・状態・台帳以外は拒否。
- 学習用の新しい画像・特徴量・モデル・ログをPCに書きません。コード・依存ライブラリ・任意の認証ファイルは別です。OSのswapやブラウザ自体の動作まで「ディスク0バイト」と保証はできません。
- 画像5MB、モデル資材384MiB/ファイル、展開特徴量128MiB、分類対象10,000件まで。公開取得は30枚/回、既存移行・新規特徴量抽出は100枚/回。大量データは複数回に分けます。初回CLIP準備は数秒では済みません。
- Drive実空きと、既存方針を継承した保守的な4TB上限を確認します。5TBを埋める目標ではなく、追加購入もしません。
- 既存ローカル学習コマンドは実行しません。既存の画像・ラベル・台帳は削除／上書きしません。旧転送キューに未処理があれば、新規収集を停止します。

## 出典と分割

### 対象料理の範囲

対象は「日本で実際に食べられている食事」であり、和食だけに限定しません。家庭料理・弁当・惣菜に加え、洋食、イタリア料理、中華料理、韓国料理、東南アジア料理、ファストフードなども候補に含めます。料理の発祥国や撮影国だけで除外せず、日本での利用場面と食事写真としての明確さを見ます。特定の料理群だけが大量の収集画像で評価を支配しないよう、料理別の独立写真数と誤認識を確認します。

現行の料理名分類は本番27・テスト28候補であり、上記すべてを認識できるという意味ではありません。候補外の料理は既存の似た料理へ無理に割り当てず、候補として記録します。新しい料理名の追加は、権利と正解ラベルを確認した写真、既存クラスとの取り違え検査、独立した学習・検証・テスト写真、アプリ側の候補・保存形式との互換性を揃えてからテスト環境で評価します。品質条件を緩めたり、評価を経ずに本番モデルへ反映したりしません。写真から料理名を判別することと、量・カロリー・PFCの推定は別の課題として扱います。

新しい設計の `01_app_feedback` ～ `05_models_and_reports` をfoodDB直下に作ります。旧公開アーカイブ／旧アプリ修正フォルダは保持し、自動移動・削除しません。

Inbox原本を移動するとApps Scriptの再送確認が壊れるため、**写真は原本1つを保持し、verified_train/evalには参照索引を保存**します。分割は不変のsplit-registryで決定します（新規は概ね70%学習・10%設定選択用validation・20%最終test）。明示的に公開evalフォルダへ置かれた写真はtest専用で、過去のtrainとの重複は隔離します。過去の分割・同一撮影場面の除外は引き継ぎます。同一SHA/近似dHash/手動sceneIdで群を作り、異なる過去split・ラベル・公開/アプリ出典を結ぶ群は隔離します。別角度の同じ料理をすべて機械的に検出できるわけではないため、人の場面確認も必要です。

アプリの同意だけでは正解の独立検証を満たしません。受領済み写真は確認待ちに入り、明確に確認したものだけ使います。元のユーザー修正ラベルを保存し、検証済みラベルを別途記録します。料理候補外の自由入力も自動的に新クラスにはしません。

料理分類用の公開取得はCC0/CC BY 2.0・3.0・4.0のみ。ライセンス・URL・作者・改変内容を保持。研究限定、NC/ND/SA、根拠不明のPublic domainは料理分類に取り込みません。Open Food FactsのSA画像は後述の独立した商品資料のみです。Nutrition5kは専用領域を確保しますが、この料理名分類パイプラインでは再収集・混合しません。

## 自動検品と弱点収集

既にローカルOllamaで使える独立VLMがある場合だけ `BODYMAKE_REVIEW_MODEL` にモデル名を設定できます。固定loopback（127.0.0.1:11434）へメモリ内画像を渡し、明確な主料理・人物なし・確信度0.95以上の判定だけ学習候補にします。モデルのダウンロード／有料APIは自動利用しません。未設定なら自動正解化せず確認待ちです。同じCLIPの予測を正解に戻す自己学習はしません。VLMの合格は保証された正解ではないため、人の点検も必要です。

VLMのみのラベルは評価の正解に使用しません。弱点抽出は過去のtrainに属する確認済み修正・独立画像数・既存キャッシュのtrain誤答から行い、validation/testの誤答を収集クエリに戻しません。初期重点は枝豆・納豆です。料理辞書の日本語名と固定CLIPの英語プロンプトを使用し、利用者の自由入力を検索サービスに送りません。辞書にあって28候補外の料理は設計待ちとして列挙し、候補を自動拡張しません。

## 複数ソースの自律取得

`acquisition.py` が探索・履歴・権利ゲートを担当します。`training_logs/acquisition-plan.json` に優先順位、`04_clip_embeddings_cache/acquisition_history.json` にソース別状態・画像/JSONの受領IDを保存します。JSONのHTTP応答は2MB、画像は5MBまでRAMで読み、リダイレクト先を自動追跡しません。ソース障害は短周期に再試行せず、権限/容量/照合失敗は停止します。

- Commons：不足上位3料理を日英交互に検索。クエリ別の継続位置をDriveへ記録。旧Commonsローカル原本・旧Drive台帳にあるIDは再取得しません。旧台帳は読み取りのみで、新しい受領証明を捏造しません。
- Hugging Face：公開データセットを最大2検索×10件探索。ライセンスタグだけでは画像の利用権を承認しません。権利確認済みの登録がある場合のみDataset Viewerの `/rows` を最大10行ずつRAMで走査します。`load_dataset` の隠れたファイルキャッシュ、ZIP全取得、gated/privateの認証迂回は使いません。Hub SHAとViewer `X-Revision` の両方が固定版と一致する必要があります。画像URLの一時署名は保存せず、dataset/revision/config/split/rowIndexを保存します。公式testはtest固定、ラベルは独立検品が必要です。
- Open Food Facts：連絡先 `BODYMAKE_OFF_CONTACT` と利用条件確認後の `BODYMAKE_OFF_TERMS_ACCEPTED=1` がある場合のみ、1日1検索・高タンパク表示の商品を最大3件取得します。`02_public_licensed/product_references` に画像と提供元の栄養表・単位・ODbL/CC BY-SA表記を保管します。分類用のsourceタグを付けず、学習ローダーもこのフォルダを読みません。商品名/パッケージを料理名の正解にしたり、提供元栄養値を写真推定の正解とみなしたりしません。API利用申告・条件確認を自動で代行しません。

初期状態では **HFの画像取得は権利確認待ち、Open Food Factsは利用設定待ち** です。探索コードがあることと、これらの画像を実際に学習したことは異なります。Commonsの取得はこの2つの設定と独立しています。

HFの承認設定はDriveのcacheフォルダ内 `approved-hf-sources.json` に置きます。`schemaVersion: 1`、`datasets` 配列（最大10件）の各項目に次の項目が必要です。単に `approved=true` とする抜け道はありません。

- `dataset`: 所有者/データセット名、`revision`: 確認した40桁のcommit SHA
- `config`, `split`, `splitRole`（train/validation/test）：公式分割とその用途
- `imageColumn`, `labelColumn`, `labelMap`（元ラベル文字列から固定候補IDへの明示対応）
- `rights`: `imagesCovered: true`, `commercialUse: true`, `reviewer`, `reviewedAt`, `evidenceUrl`, `attribution`, `license`, `licenseUrl`

取得履歴への受領記録は画像とJSONの両方を再取得照合した後のみ。途中停止でJSONまで保存済みなら原本を照合して復旧します。同一画像はバイトを再アップロードせず、出典・ラベル・公式splitの異なるJSONは残すため、分割衝突を隠さず隔離できます。

一次資料：[HF Dataset Viewer](https://huggingface.co/docs/dataset-viewer/rows)、[Open Food Facts API・利用条件](https://openfoodfacts.github.io/openfoodfacts-server/api/)、[CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)。APIの条件は取得時にも確認してください。

## 学習・採用

- browser/worker共通 `clip-features.mjs`：固定CLIP revision、q4、Transformers 4.3.0、同じ前処理とプロンプト。512次元の正規化画像特徴と生のクラス確率を再計算します。アプリ送信時の不完全なスコアを流用しません。
- npz統合キャッシュはモデル・プロンプト・候補順のfingerprint別。画像versionと正解/同意の有効性を毎回確認し、未処理画像だけ抽出。安全停止時も既存の有効キャッシュを保持。
- loss weightは基本1、検品済み自律画像1.5×確信度、利用者確認3、利用者修正5。同じ料理の自律取得データの合計寄与をアプリ修正/確認データの80%以内に抑え、その後で公開基本データ60%以上を保ちます。「全料理でアプリが過半」と「全体で公開基本が過半」は同時に成立しない場合があるため、全体の基本データ維持を優先します。
- 正則化の選択はvalidationのみ。公開/アプリの独立test各30枚以上、各料理の学習5枚・validation2枚・公開test2枚以上が必要。公開/アプリのTop-1・Top-3・MRR非悪化、料理別非悪化、アプリTop-1が2件以上・MRR改善、対応比較片側p<=0.1をbaselineと現行test候補の両方に要求。反復利用したtestのp値は記述的な根拠であり、実際のサービス精度保証ではありません。
- 合格時のみDriveのactive-test.jsonを更新。ランチャーからloopbackの3001テストアプリへメモリで提供します。Pythonはtest-calibration.jsonを書きません。本番ラベル・本番モデルは変更しません。

## 同意撤回

受付番号を `05_models_and_reports/training_logs/revocations.json` の `ids` に登録します。分かる場合は `imageSha256` にハッシュも登録します。次回以降の学習・キャッシュから除外し、そのデータを学習に使った既存候補は配信しません。

```json
{"ids":["food-photo-受付番号"],"imageSha256":[]}
```

これは使用停止の仕組みです。原写真・正解JSON・過去の候補モデルのDrive削除まで自動完了するものではありません。削除依頼時は所有者が対応する画像/JSON/派生候補の削除と再学習を行い、その確認後に対応完了とします。Inbox/キャッシュ以外へ勝手に個人記録を取り込みません。

## Apps Scriptとフロントエンドの切替順序

1. `scripts/google-drive-training-ingest/Code.gs` を専用の新しいデプロイへ反映し、所有者として `setupTrainingInbox` を実行。旧v2デプロイをいきなり置換しないでください。
2. `setupTrainingInbox` はfoodDB/01_app_feedback/inboxと再送確認用HMAC secretを設定します。外部doPostから任意のフォルダIDは受け付けません。
3. 新しい `/exec` を `NEXT_PUBLIC_BODYMAKE_TEST_TRAINING_ENDPOINT` に設定し、localhost:3001で明示同意した食事写真1枚を送信。CORSレスポンスのok・両fileId・画像SHAを確認し、Driveの原本と照合。
4. 実送信と再送の重複防止まで確認した後で、本番用 `NEXT_PUBLIC_BODYMAKE_TRAINING_ENDPOINT` を切り替えてHostingへ反映。**新クライアントはschemaVersion 2の受領レスポンスが必須。既存v2 endpointのokだけでは成功と扱いません。**

GASをこちらで実更新する前に、所有者の認証とデプロイ先の確認が必要です。今回、本番への切替は行っていません。

## 検証

`npm run test:food-ai:stream`（34件）と `node --test scripts/food-ai/streaming-upload.test.mjs`（5件）はRAM上の合成データ・モックで合格。TypeScriptの `--noEmit --incremental false` も通過。実Drive readbackは別途確認済みです。Commons写真1枚と出典JSONを直接保存・再取得照合し、確認待ちで保持しました（`commons-91948520`）。HFの公開メタデータ探索も実行しましたが、画像は未承認のため取得していません。実CLIP抽出のbrowser/worker一致、実写真の精度、デプロイ済みGASへの送信は残る統合試験項目です。UI上のモデル更新なしを成功した学習と報告しないでください。
