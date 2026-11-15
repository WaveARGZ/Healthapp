import { exerciseCatalog } from "../data/exercise-catalog.ts";
import { groupsForExercise, muscleGroups, type MuscleGroup } from "./muscle-activity.ts";
import type { FitnessGoal } from "../../types/user";
import type { WorkoutEntry } from "../../types/workout";

export interface WeeklyWorkoutAdvice {
  startDate: string;
  endDate: string;
  trainingDays: number;
  previousTrainingDays: number;
  completedSets: number;
  strengthDays: number;
  cardioDays: number;
  muscleDays: Record<MuscleGroup, number>;
  unclassifiedExercises: number;
  encouragement: string;
  balance: string;
  goal: string;
  nextStep: string;
}

const cardioExercises = new Set(exerciseCatalog.find((category) => category.label === "有酸素")?.groups.flatMap((group) => group.exercises) ?? []);

function dayNumber(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const value = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(value) && new Date(value).toISOString().slice(0, 10) === date ? value / 86_400_000 : null;
}

function dateAt(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

function encouragementFor(trainingDays: number, previousTrainingDays: number): string {
  if (trainingDays === 0) return previousTrainingDays > 0
    ? `前の7日間には${previousTrainingDays}日の記録があります。次の1回から、また積み重ねていきましょう。`
    : "最初の1回を記録すると、ここで1週間の積み重ねを振り返れます。";
  if (previousTrainingDays > 0 && trainingDays > previousTrainingDays) return `直近7日で${trainingDays}日記録。前の7日より${trainingDays - previousTrainingDays}日増えました。続けていることが形になっています。`;
  if (previousTrainingDays > 0 && trainingDays === previousTrainingDays) return `直近7日も${trainingDays}日の記録を続けています。無理のないペースを大切にしましょう。`;
  return `直近7日で${trainingDays}日記録できました。1回ずつの積み重ねが、次の習慣につながります。`;
}

function balanceFor(trainingDays: number, muscleDays: Record<MuscleGroup, number>, unclassifiedExercises: number): string {
  const active = muscleGroups.filter((group) => muscleDays[group] > 0);
  const unknownNote = unclassifiedExercises > 0 ? ` 部位を判定できない種目が${unclassifiedExercises}件あるため、実際の偏りは異なる可能性があります。` : "";
  if (trainingDays === 0) return "筋トレを記録すると、部位の偏りを確認できます。";
  if (active.length === 0) return `部位が分かる筋トレ種目はまだ記録されていません。有酸素のみ、または種目名から部位を判定できない場合は偏りを評価できません。${unknownNote}`;
  if (trainingDays === 1) return `記録上は${active.join("・")}を使っています。1日分だけでは、週間の偏りはまだ判断しづらいです。${unknownNote}`;
  const missingMajor = (["胸", "背中", "脚"] as const).filter((group) => muscleDays[group] === 0);
  if (missingMajor.length > 0) return `記録上は${active.join("・")}に取り組んでいます。${missingMajor.join("・")}の記録がないため、次の週に取り入れられるか確認してみましょう。${unknownNote}`;
  const missingOther = muscleGroups.filter((group) => muscleDays[group] === 0);
  return missingOther.length > 0
    ? `胸・背中・脚を含む${active.length}部位を記録しています。${missingOther.join("・")}の個別種目は未記録です。${unknownNote}`
    : `6部位すべてに個別種目の記録があります。${unknownNote}`;
}

function goalFor(goal: FitnessGoal | null, strengthDays: number, cardioDays: number): { detail: string; nextStep: string } {
  if (!goal) return { detail: "目標体型を設定すると、記録とのつながりを確認できます。", nextStep: "プロフィールで目標を設定しましょう。" };
  if (strengthDays === 0 && cardioDays === 0) return { detail: "直近7日には目標と照らし合わせられる運動記録がまだありません。", nextStep: "次の運動を1種目から記録してみましょう。" };
  if (goal === "build-muscle") return strengthDays > 0
    ? { detail: `${strengthDays}日に筋トレ種目を記録。筋肉を増やす目標に向けた取り組みを振り返れます。`, nextStep: "同じ種目の重量・回数・完了セットを続けて記録すると、負荷の変化が分かります。" }
    : { detail: "有酸素運動の記録があります。筋肉を増やす目標については、筋トレ種目の記録がまだありません。", nextStep: "次は取り組みやすい筋トレ種目を1つ加えてみましょう。" };
  if (goal === "lose-fat") return strengthDays > 0 && cardioDays > 0
    ? { detail: `筋トレを${strengthDays}日、有酸素を${cardioDays}日記録。両方の取り組みが見えています。`, nextStep: "継続して記録し、体重や食事の記録も合わせて変化を振り返りましょう。" }
    : strengthDays > 0
      ? { detail: `筋トレを${strengthDays}日記録。体脂肪を減らす目標に向けた運動の一部を確認できます。`, nextStep: "無理のない範囲で有酸素運動も記録すると、活動の幅が分かります。" }
      : { detail: `有酸素運動を${cardioDays}日記録。体脂肪を減らす目標に向けた運動の一部を確認できます。`, nextStep: "筋トレ種目も加えると、体を動かした内容をより幅広く振り返れます。" };
  return strengthDays > 0
    ? { detail: `${strengthDays}日に筋トレ種目を記録。現在の体型を維持するための運動習慣を振り返れます。`, nextStep: "続けやすい頻度で、使う部位の広がりも確認してみましょう。" }
    : { detail: `有酸素運動を${cardioDays}日記録。現在の体型を維持するための活動を振り返れます。`, nextStep: "筋トレ種目も記録すると、部位の偏りを確認できます。" };
}

/** Reads only recorded facts. Training intensity, form and body-shape outcomes cannot be inferred. */
export function summarizeWeeklyWorkoutAdvice(workouts: readonly WorkoutEntry[], today: string, goal: FitnessGoal | null): WeeklyWorkoutAdvice {
  const endDay = dayNumber(today);
  const safeEndDay = endDay ?? dayNumber("2000-01-01")!;
  const startDay = safeEndDay - 6;
  const previousStartDay = startDay - 7;
  const recentDays = new Set<string>();
  const previousDays = new Set<string>();
  const strengthDates = new Set<string>();
  const cardioDates = new Set<string>();
  const datesByMuscle = Object.fromEntries(muscleGroups.map((group) => [group, new Set<string>()])) as Record<MuscleGroup, Set<string>>;
  let completedSets = 0;
  let unclassifiedExercises = 0;

  for (const workout of workouts) {
    const day = dayNumber(workout.performedAt);
    if (day === null || day > safeEndDay || day < previousStartDay || !workout.exercises.some((exercise) => exercise.name.trim())) continue;
    if (day < startDay) { previousDays.add(workout.performedAt); continue; }
    recentDays.add(workout.performedAt);
    for (const exercise of workout.exercises) {
      if (!exercise.name.trim()) continue;
      const groups = groupsForExercise(exercise.name);
      if (groups.length > 0) {
        strengthDates.add(workout.performedAt);
        for (const group of groups) datesByMuscle[group].add(workout.performedAt);
      } else if (cardioExercises.has(exercise.name.trim())) cardioDates.add(workout.performedAt);
      else unclassifiedExercises++;
      completedSets += exercise.setRecords?.filter((set) => set.completed).length ?? 0;
    }
  }

  const muscleDays = Object.fromEntries(muscleGroups.map((group) => [group, datesByMuscle[group].size])) as Record<MuscleGroup, number>;
  const goalAdvice = goalFor(goal, strengthDates.size, cardioDates.size);
  return {
    startDate: dateAt(startDay), endDate: dateAt(safeEndDay),
    trainingDays: recentDays.size, previousTrainingDays: previousDays.size,
    completedSets, strengthDays: strengthDates.size, cardioDays: cardioDates.size,
    muscleDays, unclassifiedExercises,
    encouragement: encouragementFor(recentDays.size, previousDays.size),
    balance: balanceFor(recentDays.size, muscleDays, unclassifiedExercises),
    goal: `${goalAdvice.detail}${completedSets > 0 ? ` 完了チェック済みのセットは${completedSets}件です。` : ""}`,
    nextStep: goalAdvice.nextStep,
  };
}
