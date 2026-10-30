import type { ExerciseCategory } from "./exercise-catalog";

// Keep the full catalog for previously saved workouts and muscle activity.
// The picker and recommendations use this smaller, beginner-friendly menu.
export const beginnerExerciseCatalog: ExerciseCategory[] = [
  { label: "胸", groups: [
    { label: "マシン", exercises: ["チェストプレス", "ペックデックフライ"] },
    { label: "バーベル", exercises: ["バーベルベンチプレス"] },
    { label: "ダンベル", exercises: ["ダンベルベンチプレス"] },
    { label: "自重", exercises: ["膝つきプッシュアップ", "インクラインプッシュアップ", "プッシュアップ"] },
  ] },
  { label: "背中", groups: [
    { label: "マシン", exercises: ["ラットプルダウン", "シーテッドロー"] },
    { label: "ダンベル", exercises: ["ダンベルロウ"] },
    { label: "自重", exercises: ["スーパーマン", "バードドッグ"] },
  ] },
  { label: "肩", groups: [
    { label: "マシン", exercises: ["マシンショルダープレス", "マシンサイドレイズ"] },
    { label: "ダンベル", exercises: ["ダンベルショルダープレス", "サイドレイズ"] },
  ] },
  { label: "腕", groups: [
    { label: "マシン・ケーブル", exercises: ["ケーブルカール", "トライセプスプッシュダウン"] },
    { label: "バーベル", exercises: ["バーベルカール"] },
    { label: "ダンベル", exercises: ["ダンベルカール", "ハンマーカール", "キックバック"] },
    { label: "自重", exercises: ["壁プッシュアップ", "タオルカール"] },
  ] },
  { label: "脚", groups: [
    { label: "マシン", exercises: ["レッグプレス", "レッグエクステンション", "シーテッドレッグカール", "アダクション", "アブダクション"] },
    { label: "自重", exercises: ["自重スクワット", "ランジ", "ウォールシット", "ステップアップ", "ヒップリフト", "スタンディングカーフレイズ"] },
  ] },
  { label: "腹筋・体幹", groups: [
    { label: "自重", exercises: ["クランチ", "デッドバグ", "プランク", "サイドクランチ"] },
  ] },
  { label: "有酸素", groups: [
    { label: "マシン", exercises: ["トレッドミル", "エアロバイク", "クロストレーナー"] },
    { label: "器具なし", exercises: ["ウォーキング", "早歩き", "その場足踏み", "階段昇降"] },
  ] },
];

export const beginnerExerciseCount = beginnerExerciseCatalog.reduce(
  (total, category) => total + category.groups.reduce((groupTotal, group) => groupTotal + group.exercises.length, 0),
  0,
);
