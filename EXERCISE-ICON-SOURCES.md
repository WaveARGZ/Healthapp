# 種目の動作アイコン

2026-11-23確認。対象は `registrationExercises` の103種目（胸15・背中14・腕15・肩11・腹筋／体幹12・脚23・有酸素13）。元の種目名・分類・器具条件・記録方式は変更しない。

`lib/workouts/exercise-motions.ts` が各種目の動作・器具・姿勢の違い・下表の参照キーを保持し、`components/workouts/exercise-motion-icon.tsx` がオリジナルのSVGを描画する。種目の選択一覧、おすすめ、セット入力、選択後の記録欄、保存後の詳細履歴で共用する。セット入力には短い動作説明も表示する。

## 図の読み方と範囲

- 濃い線は動作中の姿勢、薄い点線は別の位置、青い矢印は動く向き。青い二本線は姿勢の保持を表す。手足が重なる側面・正面図では一方を省略することがある。
- ベンチの傾き、膝つき／壁、器具、手の向き、脚の開閉などを描き分ける。小さい画面用の模式図なので、機械の外観・部材の寸法・奥行き・細かな握り方は簡略化している。参照資料の特定メーカーの機械を再現するものではない。
- 同じ動作の器具違いは基本動作を共有し、器具や姿勢を変えて描く。例えば、ロールアウトの原資料はバーベル型も扱うが、アプリの膝コロには車輪を描く。GMBのA-Frame Inverted Pressはパイクプッシュアップと同型の準備動作として参照した。
- 既知の旧名は現在の種目と同じ図を使う。検索用の曖昧な別名から別種目を推測しない。未定義の自作種目には部位を示す中立の図を使い、名前だけからフォームを決めない。
- 負荷・回数・可動域・治療方針の提案はこの変更の対象に含めない。既存の動作動画への入口は保持する。

## 調査した原資料

ACE／NSCAの指導資料、運動指導者・出版社が自ら提供する動作説明、NHSの運動案内、器具メーカーの案内を参照した。文章・写真・動画・図版の転載や、外部の画像素材のダウンロードは行っていない。以下の「確認点」は図案のための独自の短い要約。

| 参照キー | 図案で確認した動作・違い | 参照先 |
| --- | --- | --- |
| `chest-press` | 仰向けで押し上げるプレスと、背もたれに座って前へ押すマシンプレス | ACE [Barbell Chest Press](https://www.acefitness.org/resources/everyone/exercise-library/5/chest-press/)、[Dumbbell Chest Press](https://www.acefitness.org/resources/everyone/exercise-library/19/chest-press/)、[Seated Chest Press](https://www.acefitness.org/resources/everyone/exercise-library/188/seated-chest-press/) |
| `incline-press` | 傾斜ベンチで胸の上へ押す。マシン型も背もたれと押す方向を傾けて表現 | ACE [Incline Chest Press](https://www.acefitness.org/resources/everyone/exercise-library/25/incline-chest-press/) |
| `chest-fly` | 開いた腕を胸側へ閉じる。仰向け、座位のパッド、左右のケーブルを区別 | ACE [Lying Chest Fly](https://www.acefitness.org/resources/everyone/exercise-library/21/lying-chest-fly/)、[Cable Flyes](https://www.acefitness.org/resources/everyone/exercise-library/163/standing-incline-cable-flyes/)、M&S [Pec Deck](https://www.muscleandstrength.com/exercises/pec-dec.html) |
| `push-up` | 手と足で体を支える押す動作。膝つき・手を台につく型・壁・狭い手幅を区別 | ACE [Bent Knee Push-up](https://www.acefitness.org/resources/everyone/exercise-library/13/bent-knee-push-up/)、GMB [Push-Up Tutorial](https://gmb.io/push-up-/)、NHS [Wall press-up](https://www.nhs.uk/live-well/exercise/strength-exercises/) |
| `dip` | 平行棒で肘を曲げ伸ばしする。胸の型の前傾と腕の型の直立を区別 | M&S [Chest Dip](https://www.muscleandstrength.com/exercises/chest-dip.html) |
| `lat-pulldown` | 頭上のバーを体の前側へ引き下ろす | ACE [Seated Lat Pulldown](https://www.acefitness.org/resources/everyone/exercise-library/158/seated-lat-pulldown/) |
| `machine-row` | 座位でハンドルを胴体へ引く | ACE [Machine Seated Row](https://www.acefitness.org/resources/everyone/exercise-library/168/seated-row/) |
| `cable-row` | 座位で足を支え、低いケーブルのハンドルを胴体へ引く | ACE [Cable Seated Row](https://www.acefitness.org/resources/everyone/exercise-library/48/seated-row/) |
| `pull-up` | バーへ体を引き上げる。順手／逆手と補助台を区別 | ACE [Chin-ups Technique](https://www.acefitness.org/continuing-education/prosource/february-2016/5799/ace-technique-series-chin-ups/) |
| `straight-arm-pulldown` | 肘の角度をほぼ保ち、立位で上方のバーを太ももへ下ろす | M&S [Straight Arm Lat Pull Down](https://www.muscleandstrength.com/exercises/straight-arm-lat-pull-down.html) |
| `back-extension` | 台で骨盤側を支え、股関節を使って上体を起こす | M&S [Hyperextension](https://www.muscleandstrength.com/exercises/hyperextension.html) |
| `bent-row` | 前傾から負荷を胴体へ引く。片手・膝の支持と傾斜ベンチの胸支持を区別 | ACE [Bent-over Row](https://www.acefitness.org/resources/everyone/exercise-library/12/bent-over-row/)、ACE [Supported Single-Arm Row](https://www.acefitness.org/resources/pros/expert-articles/5047/strength-training-workout-for-beginners/)、M&S [Chest Supported Row](https://www.muscleandstrength.com/exercises/chest-supported-dumbbell-row) |
| `deadlift` | 膝と股関節を伸ばして床側のバーを上げる | M&S [Deadlift](https://www.muscleandstrength.com/exercises/deadlifts.html) |
| `bird-dog` | 四つばいから反対側の腕と脚を伸ばす | ACE [Bird-dog](https://www.acefitness.org/resources/everyone/exercise-library/14/bird-dog/) |
| `superman` | うつ伏せから腕と脚を床から少し離す | ACE [Supermans](https://www.acefitness.org/resources/everyone/exercise-library/9/supermans/) |
| `biceps-curl` | 上腕を保ち肘を曲げる。ケーブル・EZバー・上腕パッド・傾斜ベンチを区別 | ACE [Bicep Curl](https://www.acefitness.org/resources/everyone/exercise-library/70/bicep-curl/)、[Seated Biceps Curl](https://www.acefitness.org/resources/everyone/exercise-library/184/seated-biceps-curl/)、M&S [Incline Curl](https://www.muscleandstrength.com/exercises/incline-dumbbell-curl.html)、[EZ Bar Curl](https://www.muscleandstrength.com/exercises/ez-bar-curl.html) |
| `triceps` | 上腕を保ち肘を伸ばす。頭上の型と上方ケーブルから押し下げる型を区別 | ACE [Triceps Extension](https://www.acefitness.org/resources/everyone/exercise-library/74/triceps-extension/)、NSCA [Basics of Strength and Conditioning Manual: Triceps Pushdown](https://www.nsca.com/contentassets/116c55d64e1343d2b264e05aaf158a91/basics_of_strength_and_conditioning_manual.pdf) |
| `close-grip-press` | 通常のベンチプレスと同じ器具で手幅を狭くする | ACE [Close-grip Bench Press](https://www.acefitness.org/resources/everyone/exercise-library/311/close-grip-bench-press/) |
| `hammer-curl` | 手のひらを向かい合わせたまま肘を曲げる | ACE [Hammer Curl](https://www.acefitness.org/resources/everyone/exercise-library/10/hammer-curl/) |
| `triceps-kickback` | 前傾し、体側の上腕を保って肘を後方へ伸ばす | ACE [Triceps Kickback](https://www.acefitness.org/resources/everyone/exercise-library/55/triceps-kickback/) |
| `towel-curl` | 足側でタオルに抵抗をかけ、腕で引く。足指のリハビリ運動とは区別 | Abrofit自身の運動ライブラリ [Towel Biceps Curl](https://abrofit.mnbresearch.com/exercises/towel-biceps-curl) |
| `shoulder-press` | 肩から頭上へ押す。バー・左右のダンベル・座位マシンを区別 | ACE [Barbell Shoulder Press](https://www.acefitness.org/resources/everyone/exercise-library/43/seated-shoulder-press/)、[Machine Shoulder Press](https://www.acefitness.org/resources/everyone/exercise-library/186/seated-shoulder-press/) |
| `lateral-raise` | 腕を横へ上げる。マシンは肘を曲げてパッドを押す | ACE [Dumbbell Lateral Raise](https://www.acefitness.org/resources/everyone/exercise-library/26/lateral-raise/)、[Machine Lateral Shoulder Raise](https://www.acefitness.org/resources/everyone/exercise-library/295/lateral-shoulder-raise/) |
| `rear-fly` | 腕を左右へ開く。前傾のダンベル型と胸パッドのあるマシン型を区別 | ACE [Reverse Fly](https://www.acefitness.org/resources/everyone/exercise-library/353/reverse-fly/)、[Incline Reverse Fly](https://www.acefitness.org/resources/everyone/exercise-library/34/incline-reverse-fly/) |
| `face-pull` | 顔の高さへケーブルを引き、肘を開く | NSCA [Face Pull (Machine)](https://www.nsca.com/education/articles/kinetic-select/face-pull-machine/) |
| `arnold-press` | 手の向きを変えながら頭上へ押す | M&S [Seated Arnold Press](https://www.muscleandstrength.com/exercises/seated-arnold-press.html) |
| `pike-push-up` | 腰を高くし、手と足で支えて上体を押す | GMB [A-Frame Inverted Press / Handstand Push-Up Progressions](https://gmb.io/handstand-push-up/) |
| `crunch` | 胸郭を骨盤側へ丸める。床・座位マシン・膝立ちケーブルを区別 | M&S [Ab Crunch](https://www.muscleandstrength.com/exercises/ab-crunch)、[Cable Crunch](https://www.muscleandstrength.com/exercises/cable-crunch.html)、ACE [Seated Crunch](https://www.acefitness.org/resources/everyone/exercise-library/291/seated-crunch/) |
| `pallof-press` | 横の抵抗に対して体を正面に保ち、腕を前へ伸ばす。ひねる動きにはしない | ACE [Anti-rotation Progression / Cable Pallof Press](https://www.acefitness.org/resources/pros/expert-articles/5625/7-exercises-to-create-an-anti-rotation-progression-sequence/)、[Isometric Pallof Press](https://www.acefitness.org/resources/everyone/blog/7258/improve-your-posture-with-these-isometric-exercises/) |
| `plank` | 前腕と足先で体をまっすぐ支えて保持 | ACE [Front Plank](https://www.acefitness.org/resources/everyone/exercise-library/32/front-plank/) |
| `side-plank` | 横向きに前腕と足で支えて保持 | ACE [Side Plank with Straight Leg](https://www.acefitness.org/resources/everyone/exercise-library/101/side-plank-with-straight-leg/) |
| `dead-bug` | 仰向けで反対側の腕と脚を動かす | ACE [Supine Dead Bug](https://www.acefitness.org/resources/everyone/exercise-library/147/supine-dead-bug/) |
| `side-crunch` | 脚を横へ倒した姿勢から上体を持ち上げる | M&S [Side Crunch](https://www.muscleandstrength.com/exercises/side-crunch.html) |
| `reverse-crunch` | 膝を胸側へ寄せ、骨盤を床から持ち上げる | ACE [Reverse Ab Crunch](https://www.acefitness.org/resources/everyone/exercise-library/76/reverse-crunch/) |
| `leg-raise` | 仰向けから伸ばした脚を上げる | M&S [Lying Floor Leg Raise](https://www.muscleandstrength.com/exercises/lying-floor-leg-raise.html) |
| `hanging-knee` | バーにぶら下がり、膝を曲げて上げる | M&S [Hanging Knee Raise](https://www.muscleandstrength.com/exercises/hanging-knee-raise.html) |
| `rollout` | 膝で支え、転がる器具を前へ進めて戻す。アプリでは車輪型に図案化 | ACE [Kneeling Roll Out](https://www.acefitness.org/resources/everyone/exercise-library/309/roll-out/) |
| `leg-press` | 背もたれで支え、足裏でプレートを押す | ACE [Seated Leg Press](https://www.acefitness.org/resources/everyone/exercise-library/154/seated-leg-press/) |
| `leg-extension` | 座って膝を伸ばし、すね側のパッドを上げる | ACE [Seated Leg Extension](https://www.acefitness.org/resources/everyone/exercise-library/183/seated-leg-extension/)、Life Fitness [Leg Curl / Extension](https://www.lifefitness.com/en-us/catalog/strength-training/selectorized/axiom-series-seated-leg-curl-extension) |
| `leg-curl` | 膝を曲げる方向。座位と、うつ伏せでかかとを上げる型を区別 | M&S [Seated Leg Curl](https://www.muscleandstrength.com/exercises/seated-leg-curl)、ACE [Lying Hamstrings Curl](https://www.acefitness.org/resources/everyone/exercise-library/153/lying-hamstrings-curl/) |
| `hip-adduction` | 座位で開いた脚を内へ閉じる | Life Fitness [Hip Abductor / Adductor](https://www.lifefitness.com/en-gb/catalog/strength-training/selectorized/axiom-series-hip-abductor-adductor) |
| `hip-abduction` | 座位で閉じた脚を外へ開く。内転の図と矢印を反転 | Life Fitness [Hip Abductor / Adductor](https://www.lifefitness.com/en-gb/catalog/strength-training/selectorized/axiom-series-hip-abductor-adductor) |
| `squat` | 膝と股関節を曲げ伸ばし。肩のバー・胸前の重り・背面のマシン支持を区別 | ACE [Back Squat](https://www.acefitness.org/resources/everyone/exercise-library/11/back-squat/)、M&S [Goblet Squat](https://www.muscleandstrength.com/exercises/dumbbell-goblet-squat)、[Hack Squat](https://www.muscleandstrength.com/exercises/narrow-hack-squat.html) |
| `calf-raise` | 足の前側で支え、かかとを上下。立位と座位を区別 | NHS [Calf raises](https://www.nhs.uk/live-well/exercise/strength-exercises/)、M&S [Seated Calf Raise](https://www.muscleandstrength.com/exercises/seated-calf-raise.html) |
| `romanian-deadlift` | 膝を軽く曲げたまま股関節を後ろへ引く。通常デッドリフトと脚の曲がりを区別 | ACE [Romanian Deadlift](https://www.acefitness.org/resources/everyone/exercise-library/317/romanian-deadlift/) |
| `hip-thrust` | 肩をベンチで支え、腰上のバーと一緒に骨盤を上げる | M&S [Barbell Hip Thrust](https://www.muscleandstrength.com/exercises/barbell-hip-thrust) |
| `bulgarian-squat` | 後ろ足をベンチに置き、前脚を曲げ伸ばす | ACE [Bulgarian Split Squat](https://www.acefitness.org/resources/everyone/exercise-library/366/bulgarian-split-squat/) |
| `lunge` | 片足を前へ出して腰を下げる。ダンベルの有無を区別 | ACE [Forward Lunge](https://www.acefitness.org/resources/everyone/exercise-library/94/forward-lunge/) |
| `chair-squat` | 椅子へ腰を下ろすようにしゃがみ、立ち上がる | NHS [Sit-to-stand](https://www.nhs.uk/live-well/exercise/strength-exercises/) |
| `reverse-lunge` | 前へ出す型と違い、片足を後方へ引く | M&S [Bodyweight Reverse Lunge](https://www.muscleandstrength.com/exercises/rear-bodyweight-lunge.html) |
| `step-up` | 段差に片足を乗せ、体を持ち上げる。階段昇降も段差を描く | NHS [Step-up](https://www.nhs.uk/live-well/exercise/balance-exercises/) |
| `glute-bridge` | 仰向けから膝を曲げた足で支え、骨盤を上げる | ACE [Glute Bridge](https://www.acefitness.org/resources/everyone/exercise-library/49/glute-bridge/) |
| `wall-sit` | 壁へ背をつけ、膝を曲げて保持 | NHS / LPT [Wall Sit](https://www.leicspart.nhs.uk/wp-content/uploads/2026/11/LPT-CHSMSK37-Patellofemoral-Pain.pdf) |
| `treadmill` | 動くベルト上を歩く・走る。床の歩行と機械を区別 | Life Fitness [Treadmill Time Goal / moving belt](https://support.lifefitness.com/hc/en-us/articles/42813666415767-Life-Fitness-Atmos-Treadmill-How-to-Set-Up-a-Time-Goal-Workout-on-Your-SE4-Console) |
| `cycling` | サドルに座ってペダルを回す | Concept2 [Setting Up the BikeErg](https://www.concept2.com/training/articles/setting-up-the-bikeerg) |
| `elliptical` | ペダルと動くハンドルを交互に動かす | Life Fitness [Atmos Elliptical operation](https://support.lifefitness.com/hc/en-us/articles/42861901438359-How-to-Mount-and-Dismount-Your-Atmos-Elliptical-Safely) |
| `rowing` | 脚で押す、上体を起こす、腕で引く順序と戻す姿勢 | Concept2 [Rowing Technique](https://www.concept2.com/training/rowing-technique) |
| `skierg` | 体幹・股関節の動作と両腕の下向きのプル | Concept2 [SkiErg Technique](https://www.concept2.com/training/skierg-technique)、[Getting Started](https://www.concept2.com/skierg-start) |
| `walking` | 左右交互に歩く。早歩きは振りと歩幅の模式図を変える | NHS [Walking for health](https://www.nhs.uk/live-well/exercise/walking-for-health/) |
| `running` | 歩行と区別して、走る姿勢を描く。ジョギングとランニングの違いは速度の厳密な閾値ではない | NHS [Couch to 5K](https://www.nhs.uk/better-health/get-active/get-running-with-couch-to-5k/couch-to-5k-running-plan/) |
| `marching` | その場で左右の膝と腕を交互に動かす | NHS [March on the spot](https://www.nhs.uk/Livewell/fitness/Pages/how-to-warm-up.aspx) |
| `side-step` | 横へ足を出し、反対の足を寄せる | NHS [Sideways walking](https://www.nhs.uk/live-well/exercise/balance-exercises/) |
| `jump-rope` | 縄を回して跳ぶ。縄・腕・足と跳ぶ向きを描く | ACE [Jump Rope](https://www.acefitness.org/resources/everyone/blog/5068/youth-fitness-reaction-ball-time/) |

## 検証と保守

`npm run test:exercise-motions` は現行カタログの全件対応、原資料キーの存在、旧名、未知の自作名、逆向きの動き・器具・姿勢の描き分け、実際のSVG出力の軽量性・非フォーカス・外部画像を含まないことを確認する。追加種目をカタログへ入れたときは図案と原資料も追加する。

実機相当の画面確認は端末内デモの空データ・架空の記録だけで行う。筋トレの保存内容、写真認識モデル、食事写真の送信先、学習処理、認証・DBルールは変更しない。追加パッケージ・外部API・画像ホスティング・アニメーションは使わない。
