import type { StaticImageData } from "next/image";

import artwork0 from "@/public/images/exercises/v2/chest-press-machine.webp";
import artwork1 from "@/public/images/exercises/v2/incline-chest-press-machine.webp";
import artwork2 from "@/public/images/exercises/v2/pec-deck-fly.webp";
import artwork3 from "@/public/images/exercises/v2/cable-fly.webp";
import artwork4 from "@/public/images/exercises/v2/smith-bench-press.webp";
import artwork5 from "@/public/images/exercises/v2/bench-press.webp";
import artwork6 from "@/public/images/exercises/v2/incline-barbell-bench-press.webp";
import artwork7 from "@/public/images/exercises/v2/dumbbell-bench-press.webp";
import artwork8 from "@/public/images/exercises/v2/incline-dumbbell-press.webp";
import artwork9 from "@/public/images/exercises/v2/dumbbell-fly.webp";
import artwork10 from "@/public/images/exercises/v2/push-up.webp";
import artwork11 from "@/public/images/exercises/v2/knee-push-up.webp";
import artwork12 from "@/public/images/exercises/v2/incline-push-up.webp";
import artwork13 from "@/public/images/exercises/v2/wall-push-up.webp";
import artwork14 from "@/public/images/exercises/v2/chest-dip.webp";
import artwork15 from "@/public/images/exercises/v2/lat-pulldown.webp";
import artwork16 from "@/public/images/exercises/v2/seated-row-machine.webp";
import artwork17 from "@/public/images/exercises/v2/seated-cable-row.webp";
import artwork18 from "@/public/images/exercises/v2/assisted-pull-up.webp";
import artwork19 from "@/public/images/exercises/v2/straight-arm-pulldown.webp";
import artwork20 from "@/public/images/exercises/v2/back-extension.webp";
import artwork21 from "@/public/images/exercises/v2/barbell-bent-row.webp";
import artwork22 from "@/public/images/exercises/v2/barbell-deadlift.webp";
import artwork23 from "@/public/images/exercises/v2/one-arm-dumbbell-row.webp";
import artwork24 from "@/public/images/exercises/v2/chest-supported-row.webp";
import artwork25 from "@/public/images/exercises/v2/pull-up.webp";
import artwork26 from "@/public/images/exercises/v2/chin-up.webp";
import artwork27 from "@/public/images/exercises/v2/bird-dog.webp";
import artwork28 from "@/public/images/exercises/v2/superman.webp";
import artwork29 from "@/public/images/exercises/v2/cable-curl.webp";
import artwork30 from "@/public/images/exercises/v2/triceps-pushdown.webp";
import artwork31 from "@/public/images/exercises/v2/cable-overhead-extension.webp";
import artwork32 from "@/public/images/exercises/v2/preacher-curl-machine.webp";
import artwork33 from "@/public/images/exercises/v2/barbell-curl.webp";
import artwork34 from "@/public/images/exercises/v2/ez-bar-curl.webp";
import artwork35 from "@/public/images/exercises/v2/close-grip-bench-press.webp";
import artwork36 from "@/public/images/exercises/v2/dumbbell-curl.webp";
import artwork37 from "@/public/images/exercises/v2/hammer-curl.webp";
import artwork38 from "@/public/images/exercises/v2/incline-dumbbell-curl.webp";
import artwork39 from "@/public/images/exercises/v2/triceps-kickback.webp";
import artwork40 from "@/public/images/exercises/v2/dumbbell-overhead-extension.webp";
import artwork41 from "@/public/images/exercises/v2/narrow-push-up.webp";
import artwork42 from "@/public/images/exercises/v2/triceps-dip.webp";
import artwork43 from "@/public/images/exercises/v2/towel-curl.webp";
import artwork44 from "@/public/images/exercises/v2/shoulder-press-machine.webp";
import artwork45 from "@/public/images/exercises/v2/lateral-raise-machine.webp";
import artwork46 from "@/public/images/exercises/v2/reverse-pec-deck.webp";
import artwork47 from "@/public/images/exercises/v2/cable-lateral-raise.webp";
import artwork48 from "@/public/images/exercises/v2/face-pull.webp";
import artwork49 from "@/public/images/exercises/v2/barbell-shoulder-press.webp";
import artwork50 from "@/public/images/exercises/v2/dumbbell-shoulder-press.webp";
import artwork51 from "@/public/images/exercises/v2/dumbbell-lateral-raise.webp";
import artwork52 from "@/public/images/exercises/v2/dumbbell-rear-fly.webp";
import artwork53 from "@/public/images/exercises/v2/arnold-press.webp";
import artwork54 from "@/public/images/exercises/v2/pike-push-up.webp";
import artwork55 from "@/public/images/exercises/v2/ab-crunch-machine.webp";
import artwork56 from "@/public/images/exercises/v2/cable-crunch.webp";
import artwork57 from "@/public/images/exercises/v2/pallof-press.webp";
import artwork58 from "@/public/images/exercises/v2/crunch.webp";
import artwork59 from "@/public/images/exercises/v2/plank.webp";
import artwork60 from "@/public/images/exercises/v2/side-plank.webp";
import artwork61 from "@/public/images/exercises/v2/dead-bug.webp";
import artwork62 from "@/public/images/exercises/v2/side-crunch.webp";
import artwork63 from "@/public/images/exercises/v2/reverse-crunch.webp";
import artwork64 from "@/public/images/exercises/v2/leg-raise.webp";
import artwork65 from "@/public/images/exercises/v2/hanging-knee-raise.webp";
import artwork66 from "@/public/images/exercises/v2/ab-wheel-rollout.webp";
import artwork67 from "@/public/images/exercises/v2/leg-press.webp";
import artwork68 from "@/public/images/exercises/v2/leg-extension.webp";
import artwork69 from "@/public/images/exercises/v2/seated-leg-curl.webp";
import artwork70 from "@/public/images/exercises/v2/lying-leg-curl.webp";
import artwork71 from "@/public/images/exercises/v2/hip-adduction.webp";
import artwork72 from "@/public/images/exercises/v2/hip-abduction.webp";
import artwork73 from "@/public/images/exercises/v2/hack-squat.webp";
import artwork74 from "@/public/images/exercises/v2/seated-calf-raise.webp";
import artwork75 from "@/public/images/exercises/v2/barbell-squat.webp";
import artwork76 from "@/public/images/exercises/v2/barbell-romanian-deadlift.webp";
import artwork77 from "@/public/images/exercises/v2/barbell-hip-thrust.webp";
import artwork78 from "@/public/images/exercises/v2/goblet-squat.webp";
import artwork79 from "@/public/images/exercises/v2/bulgarian-split-squat.webp";
import artwork80 from "@/public/images/exercises/v2/dumbbell-romanian-deadlift.webp";
import artwork81 from "@/public/images/exercises/v2/dumbbell-lunge.webp";
import artwork82 from "@/public/images/exercises/v2/bodyweight-squat.webp";
import artwork83 from "@/public/images/exercises/v2/chair-squat.webp";
import artwork84 from "@/public/images/exercises/v2/forward-lunge.webp";
import artwork85 from "@/public/images/exercises/v2/reverse-lunge.webp";
import artwork86 from "@/public/images/exercises/v2/step-up.webp";
import artwork87 from "@/public/images/exercises/v2/glute-bridge.webp";
import artwork88 from "@/public/images/exercises/v2/standing-calf-raise.webp";
import artwork89 from "@/public/images/exercises/v2/wall-sit.webp";
import artwork90 from "@/public/images/exercises/v2/treadmill.webp";
import artwork91 from "@/public/images/exercises/v2/stationary-bike.webp";
import artwork92 from "@/public/images/exercises/v2/elliptical.webp";
import artwork93 from "@/public/images/exercises/v2/rowing-machine.webp";
import artwork94 from "@/public/images/exercises/v2/skierg.webp";
import artwork95 from "@/public/images/exercises/v2/walking.webp";
import artwork96 from "@/public/images/exercises/v2/brisk-walking.webp";
import artwork97 from "@/public/images/exercises/v2/jogging.webp";
import artwork98 from "@/public/images/exercises/v2/running.webp";
import artwork99 from "@/public/images/exercises/v2/march-in-place.webp";
import artwork100 from "@/public/images/exercises/v2/stair-climb.webp";
import artwork101 from "@/public/images/exercises/v2/side-step-touch.webp";
import artwork102 from "@/public/images/exercises/v2/jump-rope.webp";

/** Original illustrations generated with the built-in image tool; see EXERCISE-ILLUSTRATIONS.md. */
export const exerciseIllustrations: Readonly<Record<string, StaticImageData>> = {
  "チェストプレス": artwork0,
  "インクラインマシンチェストプレス": artwork1,
  "ペックフライ": artwork2,
  "ケーブルフライ": artwork3,
  "スミスマシンベンチプレス": artwork4,
  "ベンチプレス": artwork5,
  "インクラインバーベルベンチプレス": artwork6,
  "ダンベルベンチプレス": artwork7,
  "インクラインダンベルプレス": artwork8,
  "ダンベルフライ": artwork9,
  "腕立て伏せ": artwork10,
  "膝つき腕立て伏せ": artwork11,
  "インクラインプッシュアップ": artwork12,
  "壁腕立て伏せ": artwork13,
  "チェストディップス": artwork14,
  "ラットプルダウン": artwork15,
  "シーテッドロー": artwork16,
  "シーテッドケーブルロー": artwork17,
  "アシスト懸垂": artwork18,
  "ストレートアームプルダウン": artwork19,
  "バックエクステンション": artwork20,
  "ベントオーバーロー": artwork21,
  "デッドリフト": artwork22,
  "ダンベルローイング": artwork23,
  "チェストサポートダンベルロー": artwork24,
  "懸垂": artwork25,
  "チンアップ": artwork26,
  "バードドッグ": artwork27,
  "スーパーマン": artwork28,
  "ケーブルカール": artwork29,
  "トライセプスプッシュダウン": artwork30,
  "ケーブルオーバーヘッドトライセプスエクステンション": artwork31,
  "マシンプリーチャーカール": artwork32,
  "バーベルカール": artwork33,
  "EZバーカール": artwork34,
  "ナローベンチプレス": artwork35,
  "ダンベルカール": artwork36,
  "ハンマーカール": artwork37,
  "インクラインダンベルカール": artwork38,
  "ダンベルトライセプスキックバック": artwork39,
  "ダンベルオーバーヘッドトライセプスエクステンション": artwork40,
  "ナロープッシュアップ": artwork41,
  "ディップス": artwork42,
  "タオルカール": artwork43,
  "マシンショルダープレス": artwork44,
  "マシンサイドレイズ": artwork45,
  "リバースペックデック": artwork46,
  "ケーブルサイドレイズ": artwork47,
  "フェイスプル": artwork48,
  "バーベルショルダープレス": artwork49,
  "ダンベルショルダープレス": artwork50,
  "ダンベルサイドレイズ": artwork51,
  "ダンベルリアレイズ": artwork52,
  "アーノルドプレス": artwork53,
  "パイクプッシュアップ": artwork54,
  "アブドミナルクランチ": artwork55,
  "ケーブルクランチ": artwork56,
  "パロフプレス": artwork57,
  "クランチ": artwork58,
  "プランク": artwork59,
  "サイドプランク": artwork60,
  "デッドバグ": artwork61,
  "サイドクランチ": artwork62,
  "リバースクランチ": artwork63,
  "レッグレイズ": artwork64,
  "ハンギングニーレイズ": artwork65,
  "腹筋ローラー（膝コロ）": artwork66,
  "レッグプレス": artwork67,
  "レッグエクステンション": artwork68,
  "シーテッドレッグカール": artwork69,
  "ライイングレッグカール": artwork70,
  "ヒップアダクション": artwork71,
  "ヒップアブダクション": artwork72,
  "ハックスクワット": artwork73,
  "シーテッドカーフレイズ": artwork74,
  "バーベルスクワット": artwork75,
  "ルーマニアンデッドリフト": artwork76,
  "バーベルヒップスラスト": artwork77,
  "ゴブレットスクワット": artwork78,
  "ダンベルブルガリアンスクワット": artwork79,
  "ダンベルルーマニアンデッドリフト": artwork80,
  "ダンベルランジ": artwork81,
  "自重スクワット": artwork82,
  "チェアスクワット": artwork83,
  "ランジ": artwork84,
  "リバースランジ": artwork85,
  "ステップアップ": artwork86,
  "ヒップリフト": artwork87,
  "スタンディングカーフレイズ": artwork88,
  "ウォールシット": artwork89,
  "トレッドミル": artwork90,
  "エアロバイク": artwork91,
  "クロストレーナー": artwork92,
  "ローイングマシン": artwork93,
  "スキーエルゴ": artwork94,
  "ウォーキング": artwork95,
  "早歩き": artwork96,
  "ジョギング": artwork97,
  "ランニング": artwork98,
  "その場足踏み": artwork99,
  "階段昇降": artwork100,
  "低負荷のステップタッチ": artwork101,
  "縄跳び": artwork102,
};
