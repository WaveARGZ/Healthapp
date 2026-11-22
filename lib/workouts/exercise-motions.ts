import { registeredExerciseForName } from "../data/registration-exercise-catalog.ts";
import type { WorkoutExerciseCategory } from "../../types/workout-preferences";

export type ExerciseMotionKind =
  | "bench-press" | "seated-press" | "fly" | "push-up" | "dip"
  | "pull-down" | "straight-pull" | "seated-row" | "bent-row" | "pull-up"
  | "hinge" | "back-extension" | "bird-dog" | "superman"
  | "curl" | "triceps" | "shoulder-press" | "lateral-raise" | "rear-fly" | "face-pull"
  | "crunch" | "plank" | "side-plank" | "dead-bug" | "side-crunch"
  | "reverse-crunch" | "leg-raise" | "hanging-knee" | "rollout" | "pallof"
  | "leg-press" | "leg-extension" | "leg-curl" | "hip-adduction" | "hip-abduction"
  | "squat" | "lunge" | "step-up" | "bridge" | "calf-raise" | "wall-sit"
  | "walk" | "run" | "bike" | "elliptical" | "rowing" | "ski"
  | "march" | "stairs" | "side-step" | "jump-rope" | "custom";

export type ExerciseIconEquipment = "none" | "barbell" | "dumbbell" | "machine" | "cable" | "smith" | "bar" | "wheel" | "towel";

export interface ExerciseMotion {
  kind: ExerciseMotionKind;
  equipment: ExerciseIconEquipment;
  action: string;
  reference: string;
  category?: WorkoutExerciseCategory;
  variant?: "incline" | "knee" | "wall" | "narrow" | "lean" | "assisted" | "underhand"
    | "one-arm" | "supported" | "deadlift" | "neutral" | "preacher" | "overhead"
    | "kickback" | "rotate" | "pike" | "seated" | "lying" | "chair" | "goblet"
    | "bulgarian" | "reverse" | "bench" | "hack" | "brisk" | "jog";
}

function motion(kind: ExerciseMotionKind, equipment: ExerciseIconEquipment, action: string, reference: string, variant?: ExerciseMotion["variant"]): ExerciseMotion {
  return { kind, equipment, action, reference, ...(variant ? { variant } : {}) };
}

// Original pictograms describe the movement, rather than inferring it from a body-part icon.
// Research references and the meaning of each drawing are listed in EXERCISE-ICON-SOURCES.md.
export const exerciseMotions: Readonly<Record<string, ExerciseMotion>> = {
  "チェストプレス": motion("seated-press", "machine", "座って胸の前からハンドルを押し出す", "chest-press"),
  "インクラインマシンチェストプレス": motion("seated-press", "machine", "背もたれに体を預け、斜め上へハンドルを押す", "incline-press", "incline"),
  "ペックフライ": motion("fly", "machine", "胸の前で左右の腕を閉じる", "chest-fly"),
  "ケーブルフライ": motion("fly", "cable", "左右のケーブルを胸の前へ引き寄せる", "chest-fly"),
  "スミスマシンベンチプレス": motion("bench-press", "smith", "ベンチに仰向けになり、ガイドに沿ってバーを押し上げる", "chest-press"),
  "ベンチプレス": motion("bench-press", "barbell", "ベンチに仰向けになり、胸の上へバーを押し上げる", "chest-press"),
  "インクラインバーベルベンチプレス": motion("bench-press", "barbell", "傾斜したベンチに仰向けになり、バーを押し上げる", "incline-press", "incline"),
  "ダンベルベンチプレス": motion("bench-press", "dumbbell", "ベンチに仰向けになり、左右のダンベルを押し上げる", "chest-press"),
  "インクラインダンベルプレス": motion("bench-press", "dumbbell", "傾斜したベンチでダンベルを押し上げる", "incline-press", "incline"),
  "ダンベルフライ": motion("fly", "dumbbell", "ベンチに仰向けになり、開いた腕を胸の上へ閉じる", "chest-fly", "lying"),
  "腕立て伏せ": motion("push-up", "none", "手とつま先で体を支え、肘を曲げ伸ばしする", "push-up"),
  "膝つき腕立て伏せ": motion("push-up", "none", "膝を床につき、肘を曲げ伸ばしする", "push-up", "knee"),
  "インクラインプッシュアップ": motion("push-up", "none", "台に手をつき、斜めに支えた体を押し戻す", "push-up", "incline"),
  "壁腕立て伏せ": motion("push-up", "none", "壁に手をつき、肘を曲げ伸ばしする", "push-up", "wall"),
  "チェストディップス": motion("dip", "bar", "平行棒で体を支え、体を少し前へ傾けて上下する", "dip", "lean"),

  "ラットプルダウン": motion("pull-down", "machine", "頭上のバーを胸の前へ引き下ろす", "lat-pulldown"),
  "シーテッドロー": motion("seated-row", "machine", "座ってハンドルを胴体へ引き寄せる", "machine-row"),
  "シーテッドケーブルロー": motion("seated-row", "cable", "座ってケーブルのハンドルをお腹へ引く", "cable-row"),
  "アシスト懸垂": motion("pull-up", "machine", "補助台に膝を乗せ、バーへ体を引き上げる", "pull-up", "assisted"),
  "ストレートアームプルダウン": motion("straight-pull", "cable", "肘の曲がりを保ち、頭上側のハンドルを太ももへ下ろす", "straight-arm-pulldown"),
  "バックエクステンション": motion("back-extension", "machine", "台で骨盤を支え、股関節から上体を起こす", "back-extension"),
  "ベントオーバーロー": motion("bent-row", "barbell", "股関節から上体を倒し、バーを胴体へ引く", "bent-row"),
  "デッドリフト": motion("hinge", "barbell", "膝と股関節を伸ばして床側のバーを持ち上げる", "deadlift", "deadlift"),
  "ダンベルローイング": motion("bent-row", "dumbbell", "片手と膝を台で支え、反対のダンベルを引き上げる", "bent-row", "one-arm"),
  "チェストサポートダンベルロー": motion("bent-row", "dumbbell", "傾斜ベンチに胸を預け、ダンベルを引く", "bent-row", "supported"),
  "懸垂": motion("pull-up", "bar", "順手で握ったバーへ体を引き上げる", "pull-up"),
  "チンアップ": motion("pull-up", "bar", "逆手で握ったバーへ体を引き上げる", "pull-up", "underhand"),
  "バードドッグ": motion("bird-dog", "none", "四つばいから反対側の腕と脚を伸ばす", "bird-dog"),
  "スーパーマン": motion("superman", "none", "うつ伏せから腕と脚を床から持ち上げる", "superman"),

  "ケーブルカール": motion("curl", "cable", "下側のケーブルを肘を曲げて引き上げる", "biceps-curl"),
  "トライセプスプッシュダウン": motion("triceps", "cable", "上腕を体のそばに置き、肘を伸ばしてハンドルを下ろす", "triceps"),
  "ケーブルオーバーヘッドトライセプスエクステンション": motion("triceps", "cable", "頭上に上腕を置き、肘を伸ばしてケーブルを押し出す", "triceps", "overhead"),
  "マシンプリーチャーカール": motion("curl", "machine", "パッドに上腕を乗せ、肘を曲げる", "biceps-curl", "preacher"),
  "バーベルカール": motion("curl", "barbell", "上腕を体のそばに保ち、バーを巻き上げる", "biceps-curl"),
  "EZバーカール": motion("curl", "barbell", "曲がったグリップのバーを肘を曲げて巻き上げる", "biceps-curl", "neutral"),
  "ナローベンチプレス": motion("bench-press", "barbell", "ベンチに仰向けになり、狭い手幅でバーを押し上げる", "close-grip-press", "narrow"),
  "ダンベルカール": motion("curl", "dumbbell", "手のひらを上へ向け、肘を曲げてダンベルを上げる", "biceps-curl"),
  "ハンマーカール": motion("curl", "dumbbell", "手のひらを向かい合わせ、肘を曲げる", "hammer-curl", "neutral"),
  "インクラインダンベルカール": motion("curl", "dumbbell", "傾斜ベンチに座り、体の横で肘を曲げる", "biceps-curl", "incline"),
  "ダンベルトライセプスキックバック": motion("triceps", "dumbbell", "上体を倒し、上腕を保ったまま肘を後ろへ伸ばす", "triceps-kickback", "kickback"),
  "ダンベルオーバーヘッドトライセプスエクステンション": motion("triceps", "dumbbell", "頭上のダンベルを肘を伸ばして持ち上げる", "triceps", "overhead"),
  "ナロープッシュアップ": motion("push-up", "none", "手幅を狭くして床を押し、肘を曲げ伸ばしする", "push-up", "narrow"),
  "ディップス": motion("dip", "bar", "平行棒で体を支え、肘を曲げ伸ばしして上下する", "dip"),
  "タオルカール": motion("curl", "towel", "足で踏んだタオルを肘を曲げて引く", "towel-curl"),

  "マシンショルダープレス": motion("shoulder-press", "machine", "座って肩の高さからハンドルを頭上へ押す", "shoulder-press"),
  "マシンサイドレイズ": motion("lateral-raise", "machine", "パッドに腕を当て、左右へ持ち上げる", "lateral-raise"),
  "リバースペックデック": motion("rear-fly", "machine", "胸をパッドに預け、前に出した腕を左右へ開く", "rear-fly", "seated"),
  "ケーブルサイドレイズ": motion("lateral-raise", "cable", "下側のケーブルを持ち、腕を横へ上げる", "lateral-raise"),
  "フェイスプル": motion("face-pull", "cable", "ケーブルを顔の高さへ引き、肘を左右へ開く", "face-pull"),
  "バーベルショルダープレス": motion("shoulder-press", "barbell", "肩の前に持ったバーを頭上へ押し上げる", "shoulder-press"),
  "ダンベルショルダープレス": motion("shoulder-press", "dumbbell", "肩の横のダンベルを頭上へ押し上げる", "shoulder-press"),
  "ダンベルサイドレイズ": motion("lateral-raise", "dumbbell", "体の横から腕を左右へ持ち上げる", "lateral-raise"),
  "ダンベルリアレイズ": motion("rear-fly", "dumbbell", "上体を倒し、ダンベルを左右へ開く", "rear-fly"),
  "アーノルドプレス": motion("shoulder-press", "dumbbell", "手のひらの向きを変えながらダンベルを頭上へ押す", "arnold-press", "rotate"),
  "パイクプッシュアップ": motion("push-up", "none", "腰を高くした姿勢で肘を曲げ伸ばしする", "pike-push-up", "pike"),

  "アブドミナルクランチ": motion("crunch", "machine", "座ってパッドを支え、上体を前へ丸める", "crunch", "seated"),
  "ケーブルクランチ": motion("crunch", "cable", "膝をつき、上側のケーブルを持って上体を丸める", "crunch"),
  "パロフプレス": motion("pallof", "cable", "横から引くケーブルに体を正面へ保ち、腕を前へ伸ばす", "pallof-press"),
  "クランチ": motion("crunch", "none", "仰向けで膝を曲げ、肩を床から持ち上げる", "crunch"),
  "プランク": motion("plank", "none", "前腕とつま先で体をまっすぐ支える", "plank"),
  "サイドプランク": motion("side-plank", "none", "横向きに前腕と足で体を支える", "side-plank"),
  "デッドバグ": motion("dead-bug", "none", "仰向けから反対側の腕と脚をゆっくり伸ばす", "dead-bug"),
  "サイドクランチ": motion("side-crunch", "none", "横向きに曲げた脚を置き、上体を横へ丸める", "side-crunch"),
  "リバースクランチ": motion("reverse-crunch", "none", "仰向けから膝を胸側へ寄せ、骨盤を持ち上げる", "reverse-crunch"),
  "レッグレイズ": motion("leg-raise", "none", "仰向けから伸ばした脚を持ち上げる", "leg-raise"),
  "ハンギングニーレイズ": motion("hanging-knee", "bar", "バーにぶら下がり、膝を胸側へ上げる", "hanging-knee"),
  "腹筋ローラー（膝コロ）": motion("rollout", "wheel", "膝を床につき、ローラーを前へ転がして戻す", "rollout"),

  "レッグプレス": motion("leg-press", "machine", "座って足裏でプレートを押す", "leg-press"),
  "レッグエクステンション": motion("leg-extension", "machine", "座ってすねのパッドを膝を伸ばして上げる", "leg-extension"),
  "シーテッドレッグカール": motion("leg-curl", "machine", "座って脚を固定し、膝を曲げてパッドを下へ引く", "leg-curl", "seated"),
  "ライイングレッグカール": motion("leg-curl", "machine", "うつ伏せになり、膝を曲げてかかとを上げる", "leg-curl", "lying"),
  "ヒップアダクション": motion("hip-adduction", "machine", "座って開いた脚を内側へ閉じる", "hip-adduction"),
  "ヒップアブダクション": motion("hip-abduction", "machine", "座って閉じた脚を外側へ開く", "hip-abduction"),
  "ハックスクワット": motion("squat", "machine", "背中をパッドに預け、足台の上で膝と股関節を曲げ伸ばしする", "squat", "hack"),
  "シーテッドカーフレイズ": motion("calf-raise", "machine", "座って足の前側で支え、かかとを上げる", "calf-raise", "seated"),
  "バーベルスクワット": motion("squat", "barbell", "バーを肩に担ぎ、膝と股関節を曲げ伸ばしする", "squat"),
  "ルーマニアンデッドリフト": motion("hinge", "barbell", "膝を軽く曲げ、股関節を引いて上体を倒して戻す", "romanian-deadlift"),
  "バーベルヒップスラスト": motion("bridge", "barbell", "上背部をベンチに置き、腰のバーを押し上げる", "hip-thrust", "bench"),
  "ゴブレットスクワット": motion("squat", "dumbbell", "重りを胸の前に抱え、膝と股関節を曲げ伸ばしする", "squat", "goblet"),
  "ダンベルブルガリアンスクワット": motion("lunge", "dumbbell", "後ろ足をベンチに乗せ、前脚の膝と股関節を曲げ伸ばしする", "bulgarian-squat", "bulgarian"),
  "ダンベルルーマニアンデッドリフト": motion("hinge", "dumbbell", "膝を軽く曲げ、ダンベルを持って股関節から倒して戻す", "romanian-deadlift"),
  "ダンベルランジ": motion("lunge", "dumbbell", "ダンベルを持ち、前後に開いた脚で体を上下する", "lunge"),
  "自重スクワット": motion("squat", "none", "お尻を後ろへ引き、膝と股関節を曲げ伸ばしする", "squat"),
  "チェアスクワット": motion("squat", "none", "椅子へ腰を下ろすようにしゃがんで立つ", "chair-squat", "chair"),
  "ランジ": motion("lunge", "none", "片足を前に踏み出し、両膝を曲げて戻る", "lunge"),
  "リバースランジ": motion("lunge", "none", "片足を後ろへ引き、両膝を曲げて戻る", "reverse-lunge", "reverse"),
  "ステップアップ": motion("step-up", "none", "片足を台に乗せ、体を持ち上げて台へ上がる", "step-up"),
  "ヒップリフト": motion("bridge", "none", "仰向けで膝を曲げ、足裏で床を押して腰を上げる", "glute-bridge"),
  "スタンディングカーフレイズ": motion("calf-raise", "none", "立って足の前側で支え、かかとを上げ下げする", "calf-raise"),
  "ウォールシット": motion("wall-sit", "none", "壁に背中をつけ、膝を曲げた姿勢を保つ", "wall-sit"),

  "トレッドミル": motion("walk", "machine", "トレッドミルのベルト上を歩く・走る", "treadmill"),
  "エアロバイク": motion("bike", "machine", "サドルに座り、ペダルを回す", "cycling"),
  "クロストレーナー": motion("elliptical", "machine", "足のペダルを交互に動かし、ハンドルを押し引きする", "elliptical"),
  "ローイングマシン": motion("rowing", "machine", "脚で押し、上体を起こしてハンドルを引く", "rowing"),
  "スキーエルゴ": motion("ski", "machine", "股関節を曲げながら両手のハンドルを下へ引く", "skierg"),
  "ウォーキング": motion("walk", "none", "腕を振り、左右の足を交互に前へ運ぶ", "walking"),
  "早歩き": motion("walk", "none", "腕を振り、歩くテンポを上げる", "walking", "brisk"),
  "ジョギング": motion("run", "none", "腕を振り、軽く弾むようにゆっくり走る", "running", "jog"),
  "ランニング": motion("run", "none", "左右の足で交互に地面を蹴り、走る", "running"),
  "その場足踏み": motion("march", "none", "その場で左右の膝を交互に上げる", "marching"),
  "階段昇降": motion("stairs", "none", "段差へ足を交互に運び、階段を上り下りする", "step-up"),
  "低負荷のステップタッチ": motion("side-step", "none", "横へ一歩出し、反対の足を寄せる", "side-step"),
  "縄跳び": motion("jump-rope", "none", "縄を回し、両足または交互の足で跳ぶ", "jump-rope"),
};

export function getExerciseMotion(name: string, category?: WorkoutExerciseCategory | null): ExerciseMotion {
  const registered = registeredExerciseForName(name);
  const key = registered?.name ?? name.trim();
  const known = Object.hasOwn(exerciseMotions, key) ? exerciseMotions[key] : undefined;
  if (known) return known;
  const bodyPart = category ?? registered?.category;
  // A free-text name does not establish an exercise technique.
  return { kind: "custom", equipment: "none", action: bodyPart ? bodyPart + "の種目" : "自分で追加した種目", reference: "custom", ...(bodyPart ? { category: bodyPart } : {}) };
}
