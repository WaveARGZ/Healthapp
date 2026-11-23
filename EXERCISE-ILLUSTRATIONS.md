# 筋トレ種目イラスト（2026-11-23）

登録済み103種目の姿勢・器具を、Codex内蔵の `image_gen` で新規生成しました。利用者が提示した写真は「人と器具が分かる小さな図」という見せ方の参考です。写真内の画像の切り抜き・転載はしていません。

## 配置と表示

- 画像: `public/images/exercises/v2/*.webp`（各384×384、白背景、WebP quality 84 / effort 6）
- 種目との対応: `lib/workouts/exercise-illustrations.ts`。既存の正式名・旧名の対応を使用します。
- 生成元ファイル名・公開画像のSHA-256とサイズ: `public/images/exercises/v2/manifest.json`
- 一覧は72px（広い画面では96px）、セット入力は128px（広い画面では160px）、記録の種目は80px、履歴・おすすめは64pxで表示します。
- Next.jsの静的画像importにより、公開先のbasePathと内容ハッシュ付きURLへ対応します。画像最適化サーバーは使わず、必要な画像を遅延読み込みします。
- 登録されていない独自種目には、フォームを推測せず既存の中立的なSVGを表示します。器具フィルター、種目、記録、お気に入り、動画の動作は維持します。

## 確認方法と出典

動作の文章・一次資料への対応は [EXERCISE-ICON-SOURCES.md](EXERCISE-ICON-SOURCES.md) と `lib/workouts/exercise-motions.ts` にあります。生成画像はCodexが全件を目視し、器具・支持位置・手足の配置が種目を識別できるかを確認しました。内転／外転のパッド位置、レッグカールのローラー位置、ラットプルダウンのバー位置など、曖昧だった画像は生成ツールで修正しました。赤色は主に使う部位の視覚的な目安であり、筋活動の測定値ではありません。

これは画面表示用の生成イラストです。利用者の実写真・公開ライセンスの食事画像・食事認識の学習データとは別です。元の生成PNGは生成ツールの保存場所に保持し、アプリには軽量化したWebPだけを含めます。生成モデルの厳密な版はツールから提供されていないため記載しません。アプリの実行時に画像生成APIは呼びません。

## 共通プロンプト

ベンチプレス以外は次の共通文に各種目の文を続けて、1種目ずつ生成しました。白背景を指定し、`transparent_background=false` を使用しています。

```text
Use case: scientific-educational. Create ONE original exercise-thumbnail illustration for the BodyMake mobile workout picker. This is a new, original image.
Visual style: professional fitness anatomy illustration, solid and anatomically believable athletic adult male mannequin, neutral light-gray skin, short black hair, blank simple face, charcoal shorts and black trainers. Fully formed torso, arms and legs, softly shaded volumes with crisp charcoal outlines; NOT a stick figure. Small coral-red highlight limited to the main trained muscle area, never an anatomical cutaway. Equipment charcoal gray with black pads and metallic bars. One adult and only the apparatus required for this exercise.
Composition: side or three-quarter angle chosen to make the actual exercise unmistakable. Show the FULL body and FULL essential equipment inside the frame; at least 8% clean WHITE margin on every side. Square canvas, pure white background. Large simple silhouettes remain clear at 80px. No text, letters, numbers, watermark, logo, decorative frame, multiple panels, or extra people. No giant muscles, clutter, extra or missing limbs, levitation, or impossible equipment. Stable natural joints and accurate hand contacts. This is a single clear representative moment of the named exercise, not a generic fitness illustration.
Exercise:
```

## 種目ごとのプロンプト

### 1. チェストプレス

公開ファイル: `chest-press-machine.webp`

```text
チェストプレス (seated-press, machine)
Specific pose and equipment: SEATED CHEST PRESS MACHINE. Sit upright against a padded backrest, feet on floor, grip two handles at chest height and push them FORWARD, not overhead. Show compact lever arms connected to machine behind the seat.
Movement description: 座って胸の前からハンドルを押し出す
Maintain the essential apparatus and body position of this named exercise.
```

### 2. インクラインマシンチェストプレス

公開ファイル: `incline-chest-press-machine.webp`

```text
インクラインマシンチェストプレス (seated-press, machine, incline)
Specific pose and equipment: INCLINE CHEST PRESS MACHINE. Seated reclined about 35 degrees on inclined backrest, feet on floor, both hands pushing lever handles diagonally up from upper chest. Not an upright shoulder press.
Movement description: 背もたれに体を預け、斜め上へハンドルを押す
Maintain the essential apparatus and body position of this named exercise.
```

### 3. ペックフライ

公開ファイル: `pec-deck-fly.webp`

```text
ペックフライ (fly, machine)
Specific pose and equipment: PEC DECK CHEST FLY MACHINE. Seated upright, elbows slightly bent, hands holding the left and right machine levers brought together in front of chest. Frame and padded backrest clearly visible.
Movement description: 胸の前で左右の腕を閉じる
Maintain the essential apparatus and body position of this named exercise.
```

### 4. ケーブルフライ

公開ファイル: `cable-fly.webp`

```text
ケーブルフライ (fly, cable)
Specific pose and equipment: STANDING CABLE CHEST FLY. Standing in slight split stance between TWO cable pulleys, one handle per hand. Arms slightly bent wide at chest height beginning to bring them together. Cables visibly connect each hand to opposite outer pulley. Chest red highlight.
Movement description: 左右のケーブルを胸の前へ引き寄せる
Maintain the essential apparatus and body position of this named exercise.
```

### 5. スミスマシンベンチプレス

公開ファイル: `smith-bench-press.webp`

```text
スミスマシンベンチプレス (bench-press, smith)
Specific pose and equipment: SMITH MACHINE FLAT BENCH PRESS. Lying on a flat bench within a Smith rack, feet planted. Both hands holding loaded straight bar above chest, bar attached at both ends to TWO vertical guide rails, elbow bend. Essential rack fully visible.
Movement description: ベンチに仰向けになり、ガイドに沿ってバーを押し上げる
Maintain the essential apparatus and body position of this named exercise.
```

### 6. ベンチプレス

公開ファイル: `bench-press.webp`

```text
Use case: scientific-educational. Create ONE original exercise illustration asset for the BodyMake workout picker: BARBELL FLAT BENCH PRESS (ベンチプレス).
Style: high-clarity professional fitness instruction illustration; a solid anatomically believable adult athletic male mannequin with light neutral gray skin, short dark hair, dark charcoal shorts and trainers, no facial details. Soft dimensional shading, crisp dark charcoal outlines, a restrained coral-red highlight across the chest/pectoral area. This is a fully drawn human body, NOT a stick figure or abstract symbol.
Pose and apparatus: side three-quarter view, head and upper back supported on a flat black upholstered bench, both feet planted on the ground, knees bent. Two hands grasp ONE straight loaded barbell at a normal shoulder-width-plus grip, holding it just above the chest with elbows bent, forearms near vertical. Show both round weight plates and the complete bench with its legs. Natural stable wrists, correct two arms and two legs, no disconnected fingers. No spotter needed.
Composition: one centered person with equipment fills about 85% of a square canvas. Entire barbell, bench and body fit inside with clean margins. Large simple shapes remain understandable at 72 pixels. Pure white background, no frame, no lettering, no arrows, no extra inset poses, no gradients in the background, no logos, no UI. Use the general readability of gym app exercise thumbnails. This is a new original illustration, not a copy of another app's artwork.
```

### 7. インクラインバーベルベンチプレス

公開ファイル: `incline-barbell-bench-press.webp`

```text
インクラインバーベルベンチプレス (bench-press, barbell, incline)
Specific pose and equipment: INCLINE BARBELL BENCH PRESS. On a bench reclined 35 degrees from horizontal, head supported, feet planted. Both hands holding ONE loaded straight barbell above upper chest, elbows bent. Clearly inclined not flat bench.
Movement description: 傾斜したベンチに仰向けになり、バーを押し上げる
Maintain the essential apparatus and body position of this named exercise.
```

### 8. ダンベルベンチプレス

公開ファイル: `dumbbell-bench-press.webp`

```text
ダンベルベンチプレス (bench-press, dumbbell)
Specific pose and equipment: FLAT DUMBBELL BENCH PRESS. Lying on horizontal bench with feet on floor. One separate dumbbell in EACH hand above sides of chest, bent elbows and upright forearms, no joined bar.
Movement description: ベンチに仰向けになり、左右のダンベルを押し上げる
Maintain the essential apparatus and body position of this named exercise.
```

### 9. インクラインダンベルプレス

公開ファイル: `incline-dumbbell-press.webp`

```text
インクラインダンベルプレス (bench-press, dumbbell, incline)
Specific pose and equipment: INCLINE DUMBBELL PRESS. Reclined 35-degree bench, feet planted, one dumbbell in each hand at upper-chest sides, bent elbows and near-vertical forearms.
Movement description: 傾斜したベンチでダンベルを押し上げる
Maintain the essential apparatus and body position of this named exercise.
```

### 10. ダンベルフライ

公開ファイル: `dumbbell-fly.webp`

```text
ダンベルフライ (fly, dumbbell, lying)
Specific pose and equipment: LYING DUMBBELL CHEST FLY. Lying on a FLAT bench, feet planted, one dumbbell in each hand. Arms open out to left and right at shoulder level with a slight fixed elbow bend. Oblique elevated view shows open-armed fly rather than press.
Movement description: ベンチに仰向けになり、開いた腕を胸の上へ閉じる
Maintain the essential apparatus and body position of this named exercise.
```

### 11. 腕立て伏せ

公開ファイル: `push-up.webp`

```text
腕立て伏せ (push-up, none)
Specific pose and equipment: STANDARD PUSH-UP. Body straight from shoulders through hips to heels, both toes on floor, two palms slightly wider than shoulders, elbows bent lowering chest toward floor. Side three-quarter view, no weights.
Movement description: 手とつま先で体を支え、肘を曲げ伸ばしする
Maintain the essential apparatus and body position of this named exercise.
```

### 12. 膝つき腕立て伏せ

公開ファイル: `knee-push-up.webp`

```text
膝つき腕立て伏せ (push-up, none, knee)
Specific pose and equipment: KNEELING PUSH-UP. Both knees contacting floor, lower legs lifted slightly behind, straight line knees-hips-shoulders, palms on floor, bent elbows. Clearly distinguish knee support from toe-supported standard push-up.
Movement description: 膝を床につき、肘を曲げ伸ばしする
Maintain the essential apparatus and body position of this named exercise.
```

### 13. インクラインプッシュアップ

公開ファイル: `incline-push-up.webp`

```text
インクラインプッシュアップ (push-up, none, incline)
Specific pose and equipment: INCLINE PUSH-UP. Standing toes on floor behind, both palms on a stable waist-low bench, straight diagonal body and elbows bent to lower chest toward bench. Bench supports HANDS, never feet.
Movement description: 台に手をつき、斜めに支えた体を押し戻す
Maintain the essential apparatus and body position of this named exercise.
```

### 14. 壁腕立て伏せ

公開ファイル: `wall-push-up.webp`

```text
壁腕立て伏せ (push-up, none, wall)
Specific pose and equipment: WALL PUSH-UP. Standing and leaning toward a plain vertical wall, feet a step away, both palms on wall at shoulder height, elbows bent. Show short wall plane edge, not floor push-up.
Movement description: 壁に手をつき、肘を曲げ伸ばしする
Maintain the essential apparatus and body position of this named exercise.
```

### 15. チェストディップス

公開ファイル: `chest-dip.webp`

```text
チェストディップス (dip, bar, lean)
Specific pose and equipment: CHEST DIP. Adult suspended between parallel horizontal bars, hands gripping one on each side, elbows bent, torso leaning forward and bent knees behind. Highlight chest, feet NOT touching floor.
Movement description: 平行棒で体を支え、体を少し前へ傾けて上下する
Maintain the essential apparatus and body position of this named exercise.
```

### 16. ラットプルダウン

公開ファイル: `lat-pulldown.webp`

```text
ラットプルダウン (pull-down, machine)
Specific pose and equipment: LAT PULLDOWN. Seated facing a cable tower with thighs under pads, hands grasping a long wide-grip overhead bar pulled down IN FRONT of head toward upper chest. Upright spine with slight rear lean, feet planted. Rear three-quarter view showing lat muscles highlighted.
Movement description: 頭上のバーを胸の前へ引き下ろす
Maintain the essential apparatus and body position of this named exercise.
```

生成画像を参照して行った修正:

```text
Correct the lat pulldown to the FRONT of the neck. Change to a clear side/front three-quarter view, showing the face and upper chest. Both hands hold the ends of the wide overhead cable bar. The bar is IN FRONT OF the face and down just below the chin toward the upper chest; it must NOT pass behind the neck or shoulders. Elbows directed downward, torso only slightly leaned back, thighs under pads, both feet on floor. Keep the same original gray adult, charcoal machine, white background, no text or branding. Full body and machine in square frame.
```

### 17. シーテッドロー

公開ファイル: `seated-row-machine.webp`

```text
シーテッドロー (seated-row, machine)
Specific pose and equipment: SEATED ROW MACHINE. Sit upright facing a chest pad with feet braced, both hands pull lever handles back next to lower ribs, elbows pointing behind body. Compact lever machine and padded seat, no long floor cable track.
Movement description: 座ってハンドルを胴体へ引き寄せる
Maintain the essential apparatus and body position of this named exercise.
```

### 18. シーテッドケーブルロー

公開ファイル: `seated-cable-row.webp`

```text
シーテッドケーブルロー (seated-row, cable)
Specific pose and equipment: SEATED CABLE ROW. Sit on low bench facing LOW cable pulley, legs forward with knees softly bent and feet braced on two angled footrests. Both hands pulling a V-shaped handle toward abdomen, cable visible from handle straight ahead to low pulley.
Movement description: 座ってケーブルのハンドルをお腹へ引く
Maintain the essential apparatus and body position of this named exercise.
```

### 19. アシスト懸垂

公開ファイル: `assisted-pull-up.webp`

```text
アシスト懸垂 (pull-up, machine, assisted)
Specific pose and equipment: ASSISTED PULL-UP MACHINE. Gripping overhead pullup handles, pulling chest upward with elbows flexed, BOTH KNEES on a counterweighted support pad beneath the body. Show support-pad weight machine; not unsupported pullup.
Movement description: 補助台に膝を乗せ、バーへ体を引き上げる
Maintain the essential apparatus and body position of this named exercise.
```

### 20. ストレートアームプルダウン

公開ファイル: `straight-arm-pulldown.webp`

```text
ストレートアームプルダウン (straight-pull, cable)
Specific pose and equipment: STRAIGHT-ARM CABLE PULLDOWN. Stand facing high pulley, slight hip hinge, both arms nearly straight, hands hold straight bar pulled down in front of thighs. High cable runs diagonally from overhead pulley to bar. No elbow-curl motion.
Movement description: 肘の曲がりを保ち、頭上側のハンドルを太ももへ下ろす
Maintain the essential apparatus and body position of this named exercise.
```

### 21. バックエクステンション

公開ファイル: `back-extension.webp`

```text
バックエクステンション (back-extension, machine)
Specific pose and equipment: 45-DEGREE BACK EXTENSION BENCH. Body supported at upper thighs on angled Roman-chair pad; ankles secured by rollers and feet supported on base. Torso extended straight in line with legs, arms crossed at chest, side view. No excessive spine arch.
Movement description: 台で骨盤を支え、股関節から上体を起こす
Maintain the essential apparatus and body position of this named exercise.
```

### 22. ベントオーバーロー

公開ファイル: `barbell-bent-row.webp`

```text
ベントオーバーロー (bent-row, barbell)
Specific pose and equipment: BARBELL BENT-OVER ROW. Standing feet hip width, knees softly bent, hip hinge with torso almost horizontal and straight back. Both hands overhand grip ONE barbell pulled close to lower ribs, elbows behind body. Bar not on floor.
Movement description: 股関節から上体を倒し、バーを胴体へ引く
Maintain the essential apparatus and body position of this named exercise.
```

### 23. デッドリフト

公開ファイル: `barbell-deadlift.webp`

```text
デッドリフト (hinge, barbell, deadlift)
Specific pose and equipment: CONVENTIONAL BARBELL DEADLIFT. Three-quarter side view at start of lifting: feet hip width, bar near shins on floor, hips bent and knees visibly bent, straight neutral spine, arms straight down gripping loaded bar outside legs. Whole lifter and plates visible.
Movement description: 膝と股関節を伸ばして床側のバーを持ち上げる
Maintain the essential apparatus and body position of this named exercise.
```

### 24. ダンベルローイング

公開ファイル: `one-arm-dumbbell-row.webp`

```text
ダンベルローイング (bent-row, dumbbell, one-arm)
Specific pose and equipment: ONE-ARM DUMBBELL ROW. One hand and same-side knee supported on horizontal bench, other foot planted on floor, straight back almost horizontal, free arm pulls ONE dumbbell toward hip with elbow behind torso.
Movement description: 片手と膝を台で支え、反対のダンベルを引き上げる
Maintain the essential apparatus and body position of this named exercise.
```

### 25. チェストサポートダンベルロー

公開ファイル: `chest-supported-row.webp`

```text
チェストサポートダンベルロー (bent-row, dumbbell, supported)
Specific pose and equipment: CHEST-SUPPORTED DUMBBELL ROW. Lying face DOWN with chest on inclined 30-degree bench, feet planted, both hands pulling separate dumbbells up alongside bench, elbows behind ribs. Distinct from lying face up press.
Movement description: 傾斜ベンチに胸を預け、ダンベルを引く
Maintain the essential apparatus and body position of this named exercise.
```

### 26. 懸垂

公開ファイル: `pull-up.webp`

```text
懸垂 (pull-up, bar)
Specific pose and equipment: OVERHAND PULL-UP. Hanging from single overhead horizontal bar with wide OVERHAND palms-away grip, elbows flexed pulling chest toward bar. Rear three-quarter view emphasizes back. Legs hang freely, no knee pad or chair.
Movement description: 順手で握ったバーへ体を引き上げる
Maintain the essential apparatus and body position of this named exercise.
```

### 27. チンアップ

公開ファイル: `chin-up.webp`

```text
チンアップ (pull-up, bar, underhand)
Specific pose and equipment: UNDERHAND CHIN-UP. Gripping horizontal overhead bar at shoulder width with palms toward the person, elbows flexed pulling chin near bar. Front three-quarter view shows underhand grip and biceps. Legs hang freely without support.
Movement description: 逆手で握ったバーへ体を引き上げる
Maintain the essential apparatus and body position of this named exercise.
```

### 28. バードドッグ

公開ファイル: `bird-dog.webp`

```text
バードドッグ (bird-dog, none)
Specific pose and equipment: BIRD DOG. On a mat on all fours: LEFT palm and RIGHT knee support on floor, RIGHT arm extended forward and LEFT leg straight back horizontal. Neutral straight spine; just two arms two legs. Side three-quarter view.
Movement description: 四つばいから反対側の腕と脚を伸ばす
Maintain the essential apparatus and body position of this named exercise.
```

### 29. スーパーマン

公開ファイル: `superman.webp`

```text
スーパーマン (superman, none)
Specific pose and equipment: SUPERMAN FLOOR EXERCISE. Lying FACE DOWN on floor, both arms stretched forward above head, chest slightly lifted, both straight legs lifted a little from floor. Abdomen and pelvis remain on floor, no extreme spine arch.
Movement description: うつ伏せから腕と脚を床から持ち上げる
Maintain the essential apparatus and body position of this named exercise.
```

### 30. ケーブルカール

公開ファイル: `cable-curl.webp`

```text
ケーブルカール (curl, cable)
Specific pose and equipment: STANDING CABLE BICEPS CURL. Stand facing LOW pulley, upper arms down by sides, both elbows bent, palms up holding a short bar near upper abdomen. Visible cable slopes down from bar to low pulley. Biceps highlighted.
Movement description: 下側のケーブルを肘を曲げて引き上げる
Maintain the essential apparatus and body position of this named exercise.
```

### 31. トライセプスプッシュダウン

公開ファイル: `triceps-pushdown.webp`

```text
トライセプスプッシュダウン (triceps, cable)
Specific pose and equipment: CABLE TRICEPS PUSHDOWN. Stand facing HIGH cable pulley, elbows tucked by ribs, forearms straightened down, both hands grip a short straight bar at thigh level. Cable runs upward to pulley. Side three-quarter view, triceps highlighted.
Movement description: 上腕を体のそばに置き、肘を伸ばしてハンドルを下ろす
Maintain the essential apparatus and body position of this named exercise.
```

### 32. ケーブルオーバーヘッドトライセプスエクステンション

公開ファイル: `cable-overhead-extension.webp`

```text
ケーブルオーバーヘッドトライセプスエクステンション (triceps, cable, overhead)
Specific pose and equipment: CABLE OVERHEAD TRICEPS EXTENSION. Stand facing AWAY from a LOW pulley, small split stance, upper arms raised beside head, bent elbows with hands holding rope behind/above head. Cable visibly runs from rope backwards down to low pulley. Triceps highlighted, only two arms.
Movement description: 頭上に上腕を置き、肘を伸ばしてケーブルを押し出す
Maintain the essential apparatus and body position of this named exercise.
```

### 33. マシンプリーチャーカール

公開ファイル: `preacher-curl-machine.webp`

```text
マシンプリーチャーカール (curl, machine, preacher)
Specific pose and equipment: MACHINE PREACHER CURL. Seated with backs of upper arms resting on a sloped preacher pad in front of chest, hands supinated holding connected machine handles, elbows flexed. Show seat, preacher pad, compact weight-stack mechanism.
Movement description: パッドに上腕を乗せ、肘を曲げる
Maintain the essential apparatus and body position of this named exercise.
```

### 34. バーベルカール

公開ファイル: `barbell-curl.webp`

```text
バーベルカール (curl, barbell)
Specific pose and equipment: STRAIGHT BARBELL BICEPS CURL. Standing straight with feet planted, both upper arms next to torso, elbows bent to hold one STRAIGHT loaded bar at waist/upper abdomen, palms upward. Biceps highlighted, no bent EZ bar.
Movement description: 上腕を体のそばに保ち、バーを巻き上げる
Maintain the essential apparatus and body position of this named exercise.
```

### 35. EZバーカール

公開ファイル: `ez-bar-curl.webp`

```text
EZバーカール (curl, barbell, neutral)
Specific pose and equipment: EZ BAR BICEPS CURL. Standing with upper arms at sides, bent elbows, holding one obviously ZIGZAG curved EZ bar with two light plates. Semi-supinated angled grip, distinguish curved bar from straight bar. Biceps highlighted.
Movement description: 曲がったグリップのバーを肘を曲げて巻き上げる
Maintain the essential apparatus and body position of this named exercise.
```

### 36. ナローベンチプレス

公開ファイル: `close-grip-bench-press.webp`

```text
ナローベンチプレス (bench-press, barbell, narrow)
Specific pose and equipment: CLOSE-GRIP BARBELL BENCH PRESS. Lying on FLAT bench feet planted, hands on loaded straight bar at narrow shoulder-width spacing directly over upper torso, elbows tucked nearer sides. Side three-quarter view; emphasize triceps.
Movement description: ベンチに仰向けになり、狭い手幅でバーを押し上げる
Maintain the essential apparatus and body position of this named exercise.
```

### 37. ダンベルカール

公開ファイル: `dumbbell-curl.webp`

```text
ダンベルカール (curl, dumbbell)
Specific pose and equipment: DUMBBELL BICEPS CURL. Standing upright, one dumbbell per hand, elbows flexed with upper arms down by ribs, PALMS FACING UP, dumbbell shafts horizontal. Biceps coral highlight.
Movement description: 手のひらを上へ向け、肘を曲げてダンベルを上げる
Maintain the essential apparatus and body position of this named exercise.
```

### 38. ハンマーカール

公開ファイル: `hammer-curl.webp`

```text
ハンマーカール (curl, dumbbell, neutral)
Specific pose and equipment: DUMBBELL HAMMER CURL. Standing upright, one dumbbell per hand, palms FACING EACH OTHER, THUMBS UP, dumbbell shafts vertical. Elbows bent, upper arms by sides. Highlight biceps, clearly neutral grip not palm-up curl.
Movement description: 手のひらを向かい合わせ、肘を曲げる
Maintain the essential apparatus and body position of this named exercise.
```

### 39. インクラインダンベルカール

公開ファイル: `incline-dumbbell-curl.webp`

```text
インクラインダンベルカール (curl, dumbbell, incline)
Specific pose and equipment: INCLINE DUMBBELL BICEPS CURL. Seated leaning back on a 45-degree inclined bench, feet planted, upper arms hanging beside the body slightly behind torso, elbows bent holding two dumbbells palms up. Biceps highlighted.
Movement description: 傾斜ベンチに座り、体の横で肘を曲げる
Maintain the essential apparatus and body position of this named exercise.
```

### 40. ダンベルトライセプスキックバック

公開ファイル: `triceps-kickback.webp`

```text
ダンベルトライセプスキックバック (triceps, dumbbell, kickback)
Specific pose and equipment: DUMBBELL TRICEPS KICKBACK. Torso hinged nearly horizontal, one hand supported on bench, other upper arm alongside torso, working elbow STRAIGHT with ONE dumbbell extended behind hip. Opposite knee/foot support stable. Highlight back of upper arm.
Movement description: 上体を倒し、上腕を保ったまま肘を後ろへ伸ばす
Maintain the essential apparatus and body position of this named exercise.
```

### 41. ダンベルオーバーヘッドトライセプスエクステンション

公開ファイル: `dumbbell-overhead-extension.webp`

```text
ダンベルオーバーヘッドトライセプスエクステンション (triceps, dumbbell, overhead)
Specific pose and equipment: DUMBBELL OVERHEAD TRICEPS EXTENSION. Upright seated on short bench, both hands clasping upper end of ONE dumbbell held behind head, elbows bent upward, upper arms near ears. Full body visible, highlight triceps.
Movement description: 頭上のダンベルを肘を伸ばして持ち上げる
Maintain the essential apparatus and body position of this named exercise.
```

### 42. ナロープッシュアップ

公開ファイル: `narrow-push-up.webp`

```text
ナロープッシュアップ (push-up, none, narrow)
Specific pose and equipment: NARROW HAND PUSH-UP. On toes in straight plank, hands CLOSE TOGETHER under center of chest, elbows tucked back alongside ribs and bent. Three-quarter overhead angle makes narrow hand placement obvious. Highlight triceps.
Movement description: 手幅を狭くして床を押し、肘を曲げ伸ばしする
Maintain the essential apparatus and body position of this named exercise.
```

### 43. ディップス

公開ファイル: `triceps-dip.webp`

```text
ディップス (dip, bar)
Specific pose and equipment: TRICEPS DIPS ON PARALLEL BARS. Body suspended on two parallel horizontal bars, upright torso, elbows bent backwards close to sides, feet clear of floor and knees lightly bent. Triceps highlighted; don't lean forward like chest dip.
Movement description: 平行棒で体を支え、肘を曲げ伸ばしして上下する
Maintain the essential apparatus and body position of this named exercise.
```

### 44. タオルカール

公開ファイル: `towel-curl.webp`

```text
タオルカール (curl, towel)
Specific pose and equipment: SEATED TOWEL RESISTANCE CURL. Sit on plain chair, one foot presses the middle of a long towel downward while BOTH hands grasp towel ends palms up. Upper arms at sides and bent elbows pull towel upward against foot resistance. Clearly show foot loop and both ends; no weights.
Movement description: 足で踏んだタオルを肘を曲げて引く
Maintain the essential apparatus and body position of this named exercise.
```

### 45. マシンショルダープレス

公開ファイル: `shoulder-press-machine.webp`

```text
マシンショルダープレス (shoulder-press, machine)
Specific pose and equipment: SEATED SHOULDER PRESS MACHINE. Upright padded backrest, feet planted, hands on machine handles just above shoulders, elbows bent, press upward OVERHEAD. Compact machine with lever arms above shoulders. Deltoids highlighted, not chest press.
Movement description: 座って肩の高さからハンドルを頭上へ押す
Maintain the essential apparatus and body position of this named exercise.
```

### 46. マシンサイドレイズ

公開ファイル: `lateral-raise-machine.webp`

```text
マシンサイドレイズ (lateral-raise, machine)
Specific pose and equipment: SEATED LATERAL RAISE MACHINE. Sit upright with elbows bent about 90 degrees and OUTER upper arms against two padded lifting levers. Elbows raised sideways to near shoulder height; fists forward. Machine pads clearly on outside of upper arms, deltoids highlighted.
Movement description: パッドに腕を当て、左右へ持ち上げる
Maintain the essential apparatus and body position of this named exercise.
```

### 47. リバースペックデック

公開ファイル: `reverse-pec-deck.webp`

```text
リバースペックデック (rear-fly, machine, seated)
Specific pose and equipment: REVERSE PEC DECK. Sit FACING the chest pad of a pec-deck machine, chest supported, arms opened sideways/back at shoulder level gripping levers. Rear three-quarter view showing rear shoulders highlighted. Distinct from chest fly sitting back against pad.
Movement description: 胸をパッドに預け、前に出した腕を左右へ開く
Maintain the essential apparatus and body position of this named exercise.
```

### 48. ケーブルサイドレイズ

公開ファイル: `cable-lateral-raise.webp`

```text
ケーブルサイドレイズ (lateral-raise, cable)
Specific pose and equipment: ONE-ARM CABLE LATERAL RAISE. Stand sideways beside LOW pulley, working hand holds one cable handle raised outward to shoulder height, arm nearly straight. Cable passes across front of thighs from opposite low pulley. Other hand by hip, deltoid highlighted.
Movement description: 下側のケーブルを持ち、腕を横へ上げる
Maintain the essential apparatus and body position of this named exercise.
```

### 49. フェイスプル

公開ファイル: `face-pull.webp`

```text
フェイスプル (face-pull, cable)
Specific pose and equipment: CABLE FACE PULL. Stand facing pulley at eye level, both hands holding separate rope ends near temples, elbows raised and spread sideways, cable runs forward at face height. Rear side angle shows rear deltoids highlighted, no behind-neck bar.
Movement description: ケーブルを顔の高さへ引き、肘を左右へ開く
Maintain the essential apparatus and body position of this named exercise.
```

### 50. バーベルショルダープレス

公開ファイル: `barbell-shoulder-press.webp`

```text
バーベルショルダープレス (shoulder-press, barbell)
Specific pose and equipment: STANDING BARBELL OVERHEAD PRESS. Both feet on ground, torso upright, hands grasp one straight bar slightly wider than shoulders, bar just above forehead as arms press upward. No bench, no squat. Deltoids highlighted.
Movement description: 肩の前に持ったバーを頭上へ押し上げる
Maintain the essential apparatus and body position of this named exercise.
```

### 51. ダンベルショルダープレス

公開ファイル: `dumbbell-shoulder-press.webp`

```text
ダンベルショルダープレス (shoulder-press, dumbbell)
Specific pose and equipment: SEATED DUMBBELL SHOULDER PRESS. Upright seated on near-vertical backrest, one separate dumbbell in each hand at just above shoulder height, forearms vertical and elbows bent 90 degrees, feet planted. Deltoids highlighted, bench not reclined like incline chest press.
Movement description: 肩の横のダンベルを頭上へ押し上げる
Maintain the essential apparatus and body position of this named exercise.
```

### 52. ダンベルサイドレイズ

公開ファイル: `dumbbell-lateral-raise.webp`

```text
ダンベルサイドレイズ (lateral-raise, dumbbell)
Specific pose and equipment: STANDING DUMBBELL LATERAL RAISE. Two arms extended sideways at shoulder height with slight elbow bend, ONE small dumbbell in each hand, upright torso and planted feet. Front three-quarter view, deltoids highlighted. No overhead press.
Movement description: 体の横から腕を左右へ持ち上げる
Maintain the essential apparatus and body position of this named exercise.
```

### 53. ダンベルリアレイズ

公開ファイル: `dumbbell-rear-fly.webp`

```text
ダンベルリアレイズ (rear-fly, dumbbell)
Specific pose and equipment: BENT-OVER DUMBBELL REVERSE FLY. Hip hinge torso almost horizontal and back straight, knees softly bent, arms spread to either side nearly level with back, one dumbbell in each hand. Rear three-quarter angle shows rear shoulders highlighted.
Movement description: 上体を倒し、ダンベルを左右へ開く
Maintain the essential apparatus and body position of this named exercise.
```

### 54. アーノルドプレス

公開ファイル: `arnold-press.webp`

```text
アーノルドプレス (shoulder-press, dumbbell, rotate)
Specific pose and equipment: SEATED ARNOLD PRESS. Sitting upright on bench with feet planted, TWO dumbbells held in front of face/upper chest, PALMS FACING THE PERSON and elbows bent in front of torso at the starting position before rotation. Not standard palms-forward shoulder press.
Movement description: 手のひらの向きを変えながらダンベルを頭上へ押す
Maintain the essential apparatus and body position of this named exercise.
```

### 55. パイクプッシュアップ

公開ファイル: `pike-push-up.webp`

```text
パイクプッシュアップ (push-up, none, pike)
Specific pose and equipment: PIKE PUSH-UP. Hands and feet on floor with hips raised high in an inverted V, head lowered toward floor between hands and elbows bent. Legs long, heels lightly raised. Side view makes inverted V unmistakable.
Movement description: 腰を高くした姿勢で肘を曲げ伸ばしする
Maintain the essential apparatus and body position of this named exercise.
```

### 56. アブドミナルクランチ

公開ファイル: `ab-crunch-machine.webp`

```text
アブドミナルクランチ (crunch, machine, seated)
Specific pose and equipment: SEATED ABDOMINAL CRUNCH MACHINE. Seated feet under lower rollers, torso flexing forward toward thighs while hands grip shoulder-height handles attached to padded resistance lever. Abdomen highlighted, distinguish from upright chest press.
Movement description: 座ってパッドを支え、上体を前へ丸める
Maintain the essential apparatus and body position of this named exercise.
```

### 57. ケーブルクランチ

公開ファイル: `cable-crunch.webp`

```text
ケーブルクランチ (crunch, cable)
Specific pose and equipment: KNEELING CABLE CRUNCH. Kneel facing high pulley with knees on floor, holding rope ends beside head, elbows beside face, curl upper torso down toward knees. Hips remain over knees, cable runs upward from rope to pulley, abs highlighted.
Movement description: 膝をつき、上側のケーブルを持って上体を丸める
Maintain the essential apparatus and body position of this named exercise.
```

### 58. パロフプレス

公開ファイル: `pallof-press.webp`

```text
パロフプレス (pallof, cable)
Specific pose and equipment: STANDING PALLOF PRESS. Stand with feet stable shoulder width, torso facing forward while low-to-chest-height cable pulley sits directly to person's LEFT. BOTH hands together holding one handle straight out in front at chest height. Cable pulls sideways. Torso not twisted; abs highlighted.
Movement description: 横から引くケーブルに体を正面へ保ち、腕を前へ伸ばす
Maintain the essential apparatus and body position of this named exercise.
```

### 59. クランチ

公開ファイル: `crunch.webp`

```text
クランチ (crunch, none)
Specific pose and equipment: FLOOR ABDOMINAL CRUNCH. Lie face up on floor, feet planted and knees bent, shoulders and upper back lifted only a little while lower back stays grounded. Arms crossed on chest, chin naturally tucked; abs highlighted. Not full situp.
Movement description: 仰向けで膝を曲げ、肩を床から持ち上げる
Maintain the essential apparatus and body position of this named exercise.
```

### 60. プランク

公開ファイル: `plank.webp`

```text
プランク (plank, none)
Specific pose and equipment: FOREARM PLANK. Both forearms and toes contact floor, elbows below shoulders. Full body forms a straight line from shoulders through hips to ankles, no sagging or raised hips. Side view, abdomen gently highlighted.
Movement description: 前腕とつま先で体をまっすぐ支える
Maintain the essential apparatus and body position of this named exercise.
```

### 61. サイドプランク

公開ファイル: `side-plank.webp`

```text
サイドプランク (side-plank, none)
Specific pose and equipment: SIDE FOREARM PLANK. Side-on body supported on ONE forearm with elbow under shoulder and side of lower foot, legs straight and feet stacked, hips lifted. Upper hand on hip. Full straight body from shoulder to feet.
Movement description: 横向きに前腕と足で体を支える
Maintain the essential apparatus and body position of this named exercise.
```

### 62. デッドバグ

公開ファイル: `dead-bug.webp`

```text
デッドバグ (dead-bug, none)
Specific pose and equipment: DEAD BUG. Lie on BACK, left arm straight backward over head near floor and right leg straight forward near floor; opposite right arm points upward and left knee bent 90 degrees over hip. Lower back grounded. Elevated three-quarter side view shows four limbs, no extra limbs.
Movement description: 仰向けから反対側の腕と脚をゆっくり伸ばす
Maintain the essential apparatus and body position of this named exercise.
```

生成画像を参照して行った修正:

```text
Change this dead bug image to its clear STARTING POSITION: lying face-up, head and entire back supported by the mat, BOTH arms straight pointing vertically upward above shoulders, BOTH hips and knees bent at 90 degrees, both thighs vertical and both shins parallel to the mat. All four limbs visible. Do not draw any extended leg or overhead-reaching arm. Keep the same original gray adult, red abdomen highlight, charcoal shorts, white background, no text, full body square canvas.
```

### 63. サイドクランチ

公開ファイル: `side-crunch.webp`

```text
サイドクランチ (side-crunch, none)
Specific pose and equipment: SIDE CRUNCH. Lie on BACK with BOTH bent knees rolled together toward the left side on floor, upper chest and shoulders curl upward slightly, hands lightly supporting head. Obliques highlighted. This is not a side plank.
Movement description: 横向きに曲げた脚を置き、上体を横へ丸める
Maintain the essential apparatus and body position of this named exercise.
```

### 64. リバースクランチ

公開ファイル: `reverse-crunch.webp`

```text
リバースクランチ (reverse-crunch, none)
Specific pose and equipment: REVERSE CRUNCH. Lie on BACK with arms extended beside torso and palms on floor; knees bent and drawn toward chest as pelvis curls slightly off floor. Shoulders and head stay down. Abs highlighted.
Movement description: 仰向けから膝を胸側へ寄せ、骨盤を持ち上げる
Maintain the essential apparatus and body position of this named exercise.
```

### 65. レッグレイズ

公開ファイル: `leg-raise.webp`

```text
レッグレイズ (leg-raise, none)
Specific pose and equipment: LYING STRAIGHT LEG RAISE. On BACK, arms by sides palms down, head and upper body resting on floor. BOTH legs straight and together raised to about 45 degrees, knees not bent. Side three-quarter view.
Movement description: 仰向けから伸ばした脚を持ち上げる
Maintain the essential apparatus and body position of this named exercise.
```

### 66. ハンギングニーレイズ

公開ファイル: `hanging-knee-raise.webp`

```text
ハンギングニーレイズ (hanging-knee, bar)
Specific pose and equipment: HANGING KNEE RAISE. Hang by both hands from overhead horizontal bar with arms straight, lift both knees bent together toward chest. No dipping parallel bars or forearm supports; abs highlighted.
Movement description: バーにぶら下がり、膝を胸側へ上げる
Maintain the essential apparatus and body position of this named exercise.
```

### 67. 腹筋ローラー（膝コロ）

公開ファイル: `ab-wheel-rollout.webp`

```text
腹筋ローラー（膝コロ） (rollout, wheel)
Specific pose and equipment: KNEELING AB WHEEL ROLLOUT. Both knees on floor, both hands grip axle handles of ONE small ab wheel ahead on floor, arms extended and trunk low in straight line from shoulders to hips. Shins trail back. Wheel and knee contact clearly visible.
Movement description: 膝を床につき、ローラーを前へ転がして戻す
Maintain the essential apparatus and body position of this named exercise.
```

### 68. レッグプレス

公開ファイル: `leg-press.webp`

```text
レッグプレス (leg-press, machine)
Specific pose and equipment: 45-DEGREE LEG PRESS MACHINE. Sit reclined with back against seat, feet shoulder-width on large inclined sled plate, knees partly bent. Show diagonal guide rails and loaded sled above feet. Hands on seat handles, thighs highlighted. Do not show leg extension rollers.
Movement description: 座って足裏でプレートを押す
Maintain the essential apparatus and body position of this named exercise.
```

### 69. レッグエクステンション

公開ファイル: `leg-extension.webp`

```text
レッグエクステンション (leg-extension, machine)
Specific pose and equipment: SEATED LEG EXTENSION MACHINE. Sit upright back supported, knees extend forward so shins nearly horizontal. Padded roller rests against FRONT of LOWER SHINS above ankles. Thighs stay on seat. Side three-quarter view, quadriceps highlighted.
Movement description: 座ってすねのパッドを膝を伸ばして上げる
Maintain the essential apparatus and body position of this named exercise.
```

### 70. シーテッドレッグカール

公開ファイル: `seated-leg-curl.webp`

```text
シーテッドレッグカール (leg-curl, machine, seated)
Specific pose and equipment: SEATED LEG CURL MACHINE. Sit upright, thighs secured beneath a lap pad, knees BENT downward under seat, roller against BACK of LOWER LEGS above heels being pulled downward/back. Side view, hamstrings highlighted. Not front-shin leg extension.
Movement description: 座って脚を固定し、膝を曲げてパッドを下へ引く
Maintain the essential apparatus and body position of this named exercise.
```

生成画像を参照して行った修正:

```text
Correct the machine to a SEATED LEG CURL (hamstrings), NOT a leg extension. View from the side, person sits with supported back, a horizontal restraint pad on TOP of lower thighs. Knees are bent, heels pulled BACK UNDER the chair. The resistance roller is BEHIND the lower calves/ankles pressing against the BACK of both legs, never against the front shin. Show a clear gap in front of shins with no pad there. Hands on side handles, red hamstring highlight on BACK of thigh. Keep gray mannequin and charcoal equipment, white square background, whole apparatus.
```

### 71. ライイングレッグカール

公開ファイル: `lying-leg-curl.webp`

```text
ライイングレッグカール (leg-curl, machine, lying)
Specific pose and equipment: LYING LEG CURL MACHINE. Lie FACE DOWN on long horizontal padded bench, thighs stay on pad, BOTH knees bent with heels lifted toward buttocks. One padded roller contacts BACK of both ankles. Side view, hamstrings highlighted.
Movement description: うつ伏せになり、膝を曲げてかかとを上げる
Maintain the essential apparatus and body position of this named exercise.
```

### 72. ヒップアダクション

公開ファイル: `hip-adduction.webp`

```text
ヒップアダクション (hip-adduction, machine)
Specific pose and equipment: HIP ADDUCTION MACHINE. Seated front three-quarter, back supported, INNER knees touch two inward-facing pads. Knees and feet CLOSE together in finishing position of squeezing legs inward. Small arrows toward midline are allowed ONLY for this exercise to clarify inward motion. Highlight inner thighs.
Movement description: 座って開いた脚を内側へ閉じる
Maintain the essential apparatus and body position of this named exercise.
```

生成画像を参照して行った修正:

```text
Correct this seated HIP ADDUCTION machine illustration. Show a clear frontal three-quarter view, thighs partly SPREAD, knees separated enough to see TWO black padded surfaces located BETWEEN the thighs, each touching the INNER side of one knee. The knees squeeze inward against these INNER-knee pads; there are NO pads outside the knees. Small arrows from each knee toward the midline, inner thigh red highlights. Both hands on side grips, feet supported. Keep the same gray adult and charcoal machine, white square canvas, whole equipment, no words.
```

### 73. ヒップアブダクション

公開ファイル: `hip-abduction.webp`

```text
ヒップアブダクション (hip-abduction, machine)
Specific pose and equipment: HIP ABDUCTION MACHINE. Seated front three-quarter, back supported, OUTER knees press outward against pads, legs spread wide in finishing position. Small arrows pointing outward are allowed ONLY for this exercise to clarify opening motion. Highlight outer hips, not inner thigh.
Movement description: 座って閉じた脚を外側へ開く
Maintain the essential apparatus and body position of this named exercise.
```

### 74. ハックスクワット

公開ファイル: `hack-squat.webp`

```text
ハックスクワット (squat, machine, hack)
Specific pose and equipment: HACK SQUAT MACHINE. Body leaning back against inclined sled pad, shoulders beneath pads, both feet on fixed tilted footplate below, knees flexed to squat. Hands grip handles beside shoulders. Diagonal guide rails and sled clear, quadriceps highlighted.
Movement description: 背中をパッドに預け、足台の上で膝と股関節を曲げ伸ばしする
Maintain the essential apparatus and body position of this named exercise.
```

### 75. シーテッドカーフレイズ

公開ファイル: `seated-calf-raise.webp`

```text
シーテッドカーフレイズ (calf-raise, machine, seated)
Specific pose and equipment: SEATED CALF RAISE MACHINE. Seated upright, padded lever lies across BOTH thighs just above knees, balls of feet on small raised ledge and HEELS raised clear. Knees about 90 degrees. Side angle shows raised heels, calves highlighted.
Movement description: 座って足の前側で支え、かかとを上げる
Maintain the essential apparatus and body position of this named exercise.
```

### 76. バーベルスクワット

公開ファイル: `barbell-squat.webp`

```text
バーベルスクワット (squat, barbell)
Specific pose and equipment: BARBELL BACK SQUAT. Feet stable shoulder-width, loaded bar resting across upper BACK below neck, hands hold it wider than shoulders. Hips down and back, knees bent, heels planted, spine neutral. Side three-quarter view, thigh/glute highlight.
Movement description: バーを肩に担ぎ、膝と股関節を曲げ伸ばしする
Maintain the essential apparatus and body position of this named exercise.
```

### 77. ルーマニアンデッドリフト

公開ファイル: `barbell-romanian-deadlift.webp`

```text
ルーマニアンデッドリフト (hinge, barbell)
Specific pose and equipment: BARBELL ROMANIAN DEADLIFT. Feet planted, knees only slightly bent, hips pushed BACK, torso hinged forward with straight spine, arms straight holding loaded bar close along shins just below knees. Bar stays OFF ground. Show longer legs than conventional deadlift.
Movement description: 膝を軽く曲げ、股関節を引いて上体を倒して戻す
Maintain the essential apparatus and body position of this named exercise.
```

### 78. バーベルヒップスラスト

公開ファイル: `barbell-hip-thrust.webp`

```text
バーベルヒップスラスト (bridge, barbell, bench)
Specific pose and equipment: BARBELL HIP THRUST. Upper back/shoulder blades rest against edge of horizontal bench, both feet flat on floor and knees bent90. Hips raised with ONE padded barbell across hip crease held by both hands. Torso horizontal from shoulders to knees, head follows torso. Highlight glutes.
Movement description: 上背部をベンチに置き、腰のバーを押し上げる
Maintain the essential apparatus and body position of this named exercise.
```

### 79. ゴブレットスクワット

公開ファイル: `goblet-squat.webp`

```text
ゴブレットスクワット (squat, dumbbell, goblet)
Specific pose and equipment: DUMBBELL GOBLET SQUAT. Standing squat bottom, heels grounded, knees bend outward naturally, holding ONE dumbbell vertically with both hands under top plate at center of chest. Upright torso, thighs highlighted. No shoulder bar.
Movement description: 重りを胸の前に抱え、膝と股関節を曲げ伸ばしする
Maintain the essential apparatus and body position of this named exercise.
```

### 80. ダンベルブルガリアンスクワット

公開ファイル: `bulgarian-split-squat.webp`

```text
ダンベルブルガリアンスクワット (lunge, dumbbell, bulgarian)
Specific pose and equipment: DUMBBELL BULGARIAN SPLIT SQUAT. Front foot planted, rear foot instep rests on a low bench BEHIND body. Front knee bent, torso mostly upright, ONE dumbbell hanging in each hand at sides. Show both legs and bench clearly, thigh highlight.
Movement description: 後ろ足をベンチに乗せ、前脚の膝と股関節を曲げ伸ばしする
Maintain the essential apparatus and body position of this named exercise.
```

### 81. ダンベルルーマニアンデッドリフト

公開ファイル: `dumbbell-romanian-deadlift.webp`

```text
ダンベルルーマニアンデッドリフト (hinge, dumbbell)
Specific pose and equipment: DUMBBELL ROMANIAN DEADLIFT. Feet hip-width, knees only slightly bent, hips pushed BACK, back straight and torso hinged forward. Two arms straight down holding separate dumbbells close to fronts of shins below knees, weights off floor.
Movement description: 膝を軽く曲げ、ダンベルを持って股関節から倒して戻す
Maintain the essential apparatus and body position of this named exercise.
```

### 82. ダンベルランジ

公開ファイル: `dumbbell-lunge.webp`

```text
ダンベルランジ (lunge, dumbbell)
Specific pose and equipment: DUMBBELL FORWARD LUNGE. One foot well forward planted flat, front knee bent about90 and rear knee lowered just above floor. One dumbbell in each hand hanging at sides, upright torso. Both feet visible, thigh highlight.
Movement description: ダンベルを持ち、前後に開いた脚で体を上下する
Maintain the essential apparatus and body position of this named exercise.
```

### 83. 自重スクワット

公開ファイル: `bodyweight-squat.webp`

```text
自重スクワット (squat, none)
Specific pose and equipment: BODYWEIGHT SQUAT. Both heels flat shoulder-width apart, knees bent and hips lowered back, torso naturally leaning slightly forward with straight spine, both arms extended forward for balance. No weights or machine.
Movement description: お尻を後ろへ引き、膝と股関節を曲げ伸ばしする
Maintain the essential apparatus and body position of this named exercise.
```

### 84. チェアスクワット

公開ファイル: `chair-squat.webp`

```text
チェアスクワット (squat, none, chair)
Specific pose and equipment: CHAIR SQUAT / SIT TO STAND. Plain stable chair behind person, hips hovering just above seat, knees bent, feet flat on floor slightly ahead of chair, torso leaning forward slightly, arms extended forward. No weights.
Movement description: 椅子へ腰を下ろすようにしゃがんで立つ
Maintain the essential apparatus and body position of this named exercise.
```

### 85. ランジ

公開ファイル: `forward-lunge.webp`

```text
ランジ (lunge, none)
Specific pose and equipment: BODYWEIGHT FORWARD LUNGE. One foot steps FORWARD, front knee bent about90, rear knee close above floor with heel lifted. Hands on hips, torso upright. Clear forward step stance, no weights.
Movement description: 片足を前に踏み出し、両膝を曲げて戻る
Maintain the essential apparatus and body position of this named exercise.
```

### 86. リバースランジ

公開ファイル: `reverse-lunge.webp`

```text
リバースランジ (lunge, none, reverse)
Specific pose and equipment: BODYWEIGHT REVERSE LUNGE. Side view of person stepping LEFT leg BACK behind planted right front foot, front knee bent, back knee nearly touches floor, hands together at chest. One small arrow pointing BACKWARD near moving foot allowed for distinguishing reverse direction. No weights.
Movement description: 片足を後ろへ引き、両膝を曲げて戻る
Maintain the essential apparatus and body position of this named exercise.
```

### 87. ステップアップ

公開ファイル: `step-up.webp`

```text
ステップアップ (step-up, none)
Specific pose and equipment: BODYWEIGHT STEP-UP. One entire foot on a low solid rectangular box, front knee bent; torso lifting upward with opposite trailing foot just off ground. Arms balancing naturally. One box, not staircase, no dumbbells.
Movement description: 片足を台に乗せ、体を持ち上げて台へ上がる
Maintain the essential apparatus and body position of this named exercise.
```

### 88. ヒップリフト

公開ファイル: `glute-bridge.webp`

```text
ヒップリフト (bridge, none)
Specific pose and equipment: FLOOR GLUTE BRIDGE. Lie face up with shoulders and head resting on floor, knees bent and feet planted, hips raised until torso and thighs form a straight diagonal. Both palms on floor beside body, glutes highlighted. No bench or barbell.
Movement description: 仰向けで膝を曲げ、足裏で床を押して腰を上げる
Maintain the essential apparatus and body position of this named exercise.
```

### 89. スタンディングカーフレイズ

公開ファイル: `standing-calf-raise.webp`

```text
スタンディングカーフレイズ (calf-raise, none)
Specific pose and equipment: STANDING CALF RAISE. Stand upright with BOTH heels visibly elevated and forefeet touching ground, knees straight, one hand lightly touching a simple vertical support for balance. Side view to clearly show raised heels, calves highlighted.
Movement description: 立って足の前側で支え、かかとを上げ下げする
Maintain the essential apparatus and body position of this named exercise.
```

### 90. ウォールシット

公開ファイル: `wall-sit.webp`

```text
ウォールシット (wall-sit, none)
Specific pose and equipment: WALL SIT. Back and hips against a plain wall, knees bent about90 with thighs horizontal, feet planted in front. Hands resting on thighs. Side three-quarter view, thigh highlight. No chair.
Movement description: 壁に背中をつけ、膝を曲げた姿勢を保つ
Maintain the essential apparatus and body position of this named exercise.
```

### 91. トレッドミル

公開ファイル: `treadmill.webp`

```text
トレッドミル (walk, machine)
Specific pose and equipment: TREADMILL WALKING. Adult walking on a compact treadmill BELT, opposite arms and legs naturally swinging, both shoes over belt, treadmill base/front uprights and console visible. No outdoor background.
Movement description: トレッドミルのベルト上を歩く・走る
Maintain the essential apparatus and body position of this named exercise.
```

### 92. エアロバイク

公開ファイル: `stationary-bike.webp`

```text
エアロバイク (bike, machine)
Specific pose and equipment: STATIONARY EXERCISE BIKE. Adult seated on saddle, both hands on front handlebar, feet securely on pedals at different heights, knees bent naturally. Show exercise bike base and flywheel, no road bicycle.
Movement description: サドルに座り、ペダルを回す
Maintain the essential apparatus and body position of this named exercise.
```

### 93. クロストレーナー

公開ファイル: `elliptical.webp`

```text
クロストレーナー (elliptical, machine)
Specific pose and equipment: ELLIPTICAL CROSS TRAINER. Upright adult standing with one foot on EACH long moving pedal and each hand holding its corresponding moving vertical handle. Opposing arm-leg positions, machine elliptical flywheel/base visible.
Movement description: 足のペダルを交互に動かし、ハンドルを押し引きする
Maintain the essential apparatus and body position of this named exercise.
```

### 94. ローイングマシン

公開ファイル: `rowing-machine.webp`

```text
ローイングマシン (rowing, machine)
Specific pose and equipment: ROWING ERGOMETER. Seated on sliding seat on LONG horizontal rail, both feet strapped to inclined footrests near fan wheel, knees nearly straight, both hands pull handle to lower ribs. Handle cable connects to fan housing, torso modestly leaned back.
Movement description: 脚で押し、上体を起こしてハンドルを引く
Maintain the essential apparatus and body position of this named exercise.
```

### 95. スキーエルゴ

公開ファイル: `skierg.webp`

```text
スキーエルゴ (ski, machine)
Specific pose and equipment: SKIERG DOUBLE-POLE. Adult standing facing tall ski-erg frame, knees softly bent and torso hip-hinged forward, one cable handle in each hand pulled down alongside thighs. TWO cords from hands to TWO overhead pulleys, machine base fan visible.
Movement description: 股関節を曲げながら両手のハンドルを下へ引く
Maintain the essential apparatus and body position of this named exercise.
```

生成画像を参照して行った修正:

```text
Correct this SkiErg exercise illustration so BOTH hands clearly grip the TWO separate cable handles at the same time. Choose a front three-quarter angle with BOTH arms visible on opposite sides of the torso, EACH hand closed around its own handle, two taut cords from the high pulleys to the hands. Show the end of a double-pole stroke, slight hip hinge and slightly bent knees, handles beside thighs. No unused dangling handle. Keep gray adult, charcoal SkiErg machine, white square background, full body and apparatus, no text.
```

### 96. ウォーキング

公開ファイル: `walking.webp`

```text
ウォーキング (walk, none)
Specific pose and equipment: RELAXED WALKING. Adult in natural walking stride, front heel contacting ground, rear toes still touching ground, opposite arms swinging naturally modestly, upright torso. No machine or scenery. No airborne running phase.
Movement description: 腕を振り、左右の足を交互に前へ運ぶ
Maintain the essential apparatus and body position of this named exercise.
```

### 97. 早歩き

公開ファイル: `brisk-walking.webp`

```text
早歩き (walk, none, brisk)
Specific pose and equipment: BRISK WALKING. Adult walking purposefully, one heel planted in front and opposite toe behind, elbows bent90 with active opposite arm swing, longer step than relaxed walk. At least one foot contacting floor, not running airborne.
Movement description: 腕を振り、歩くテンポを上げる
Maintain the essential apparatus and body position of this named exercise.
```

### 98. ジョギング

公開ファイル: `jogging.webp`

```text
ジョギング (run, none, jog)
Specific pose and equipment: EASY JOGGING. Adult relaxed slow running, elbows bent naturally, one knee softly forward, opposite leg trails, short gentle airborne stride. Side three-quarter, no machine or scenery.
Movement description: 腕を振り、軽く弾むようにゆっくり走る
Maintain the essential apparatus and body position of this named exercise.
```

### 99. ランニング

公開ファイル: `running.webp`

```text
ランニング (run, none)
Specific pose and equipment: RUNNING. Adult in clear running stride with forward knee driven up and rear leg extending back, opposite elbows bent with strong arm swing, slight whole-body forward lean. Both shoes in short airborne phase, no machine.
Movement description: 左右の足で交互に地面を蹴り、走る
Maintain the essential apparatus and body position of this named exercise.
```

### 100. その場足踏み

公開ファイル: `march-in-place.webp`

```text
その場足踏み (march, none)
Specific pose and equipment: MARCHING IN PLACE. Adult upright front three-quarter, ONE knee lifted forward to hip height and opposite arm raised, other foot firmly beneath hips on floor. No forward travelling, no equipment.
Movement description: その場で左右の膝を交互に上げる
Maintain the essential apparatus and body position of this named exercise.
```

### 101. 階段昇降

公開ファイル: `stair-climb.webp`

```text
階段昇降 (stairs, none)
Specific pose and equipment: STAIR CLIMBING. Adult walking upward on a compact freestanding THREE-STEP staircase, one foot on higher step, other foot on next lower step, knees bending naturally, arms swinging. All three steps visible, no tall buildings.
Movement description: 段差へ足を交互に運び、階段を上り下りする
Maintain the essential apparatus and body position of this named exercise.
```

### 102. 低負荷のステップタッチ

公開ファイル: `side-step-touch.webp`

```text
低負荷のステップタッチ (side-step, none)
Specific pose and equipment: LOW-IMPACT SIDE STEP TOUCH. Front view, adult stepping right foot OUT TO SIDE and left foot drawn inward toward it, both knees softly bent, feet on floor and hands at waist. One small horizontal lateral arrow allowed. No weights or jumping.
Movement description: 横へ一歩出し、反対の足を寄せる
Maintain the essential apparatus and body position of this named exercise.
```

### 103. 縄跳び

公開ファイル: `jump-rope.webp`

```text
縄跳び (jump-rope, none)
Specific pose and equipment: JUMP ROPE. Adult upright holding ONE handle in each hand near hips, clearly continuous thin rope curves up around both sides and overhead, BOTH feet just above floor with soft knees. Entire rope fits frame, no extra ropes.
Movement description: 縄を回し、両足または交互の足で跳ぶ
Maintain the essential apparatus and body position of this named exercise.
```
