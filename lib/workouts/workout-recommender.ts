import { canonicalExerciseName, matchesExerciseName, normalizeExerciseSearch, registeredExerciseForName, registrationExercises } from "../data/registration-exercise-catalog.ts";
import type { FitnessGoal } from "@/types/user";
import type { WorkoutEntry } from "@/types/workout";
import type { CustomExercise, WorkoutExerciseCategory, WorkoutSplitPlan } from "@/types/workout-preferences";
import { getWorkoutDayPlan } from "./workout-split.ts";

export interface WorkoutSuggestion {
  name: string;
  category: WorkoutExerciseCategory;
  group: string;
  reasons: string[];
}

const muscleFocusPatterns: Array<[string, RegExp]> = [
  ["胸", /胸|大胸筋|胸筋/],
  ["背中", /背中|背筋|広背筋/],
  ["肩", /肩|三角筋/],
  ["腕", /腕|二頭筋|三頭筋|前腕/],
  ["脚", /脚|足|下半身|大腿|ハムストリング|臀部|お尻/],
  ["腹筋・体幹", /腹|体幹|コア/],
  ["有酸素", /有酸素|脂肪燃焼|持久力|ランニング|ウォーキング/],
];

export function detectMuscleFocus(query: string): string | undefined {
  if (registeredExerciseForName(query)) return undefined;
  return muscleFocusPatterns.find(([, pattern]) => pattern.test(query.trim()))?.[0];
}

function requirementsFor(name: string): string[] {
  const registered = registeredExerciseForName(name);
  if (registered) return registered.requiredEquipment;
  const requirements = new Set<string>();
  if (/バーベル|EZバー/.test(name)) requirements.add("バーベル");
  if (/^(バックスクワット|フロントスクワット|デッドリフト|ルーマニアンデッドリフト|ラックプル|グッドモーニング)$/.test(name)) requirements.add("バーベル");
  if (/ダンベル/.test(name)) requirements.add("ダンベル");
  if (/スミス/.test(name)) requirements.add("スミスマシン");
  if (/ケーブル/.test(name)) requirements.add("ケーブルマシン");
  if (/マシン|ペックデック|チェストプレス|ラットプルダウン|レッグプレス|ハックスクワット|レッグカール|レッグエクステンション|アダクション|アブダクション|ステアクライマー/.test(name) && !/スミス|ケーブル|クロストレーナー|ローイングマシン/.test(name)) requirements.add("ウェイトマシン");
  if (/ベンチプレス|ダンベルプレス|ダンベルフライ|ベンチディップ/.test(name)) requirements.add("ベンチ");
  if (/アシストプルアップ|アシストディップス/.test(name)) requirements.add("ウェイトマシン");
  else if (/懸垂|プルアップ|チンアップ|ハンギング|デッドハング|ハング/.test(name)) requirements.add("懸垂バー");
  if (/ディップス|ディップ/.test(name) && !/ベンチディップ|アシストディップス/.test(name)) requirements.add("ディップスバー");
  if (/トレッドミル|ランニング/.test(name)) requirements.add("トレッドミル");
  if (/エアロバイク|スピンバイク/.test(name)) requirements.add("エアロバイク");
  if (/クロストレーナー/.test(name)) requirements.add("クロストレーナー");
  if (/ローイングマシン/.test(name)) requirements.add("ローイングマシン");
  if (/スキーエルゴ/.test(name)) requirements.add("スキーエルゴ");
  if (/縄跳び/.test(name)) requirements.add("縄跳び");
  if (/TRX/.test(name)) requirements.add("TRX");
  return [...requirements];
}

const equipmentAliases: Record<string, string[]> = {
  "バーベル": ["バーベル", "ezバー", "ezバー・バーベル", "パワーラック"],
  "ダンベル": ["ダンベル", "可変式ダンベル"],
  "スミスマシン": ["スミス"],
  "ケーブルマシン": ["ケーブル", "ケーブルマシン"],
  "ウェイトマシン": ["マシン", "プレートロード", "ウェイトマシン", "チェストプレス", "ペックデック", "ラットプルダウン", "レッグプレス", "ハックスクワット", "レッグカール", "レッグエクステンション", "アダクション", "アブダクション", "ステアクライマー", "ショルダープレス"],
  "ベンチ": ["ベンチ"],
  "懸垂バー": ["懸垂", "プルアップ", "チンニング", "チンアップ"],
  "ディップスバー": ["ディップス", "平行棒", "ディップバー"],
  "トレッドミル": ["トレッドミル", "ランニングマシン"],
  "エアロバイク": ["エアロバイク", "スピンバイク", "フィットネスバイク"],
  "クロストレーナー": ["クロストレーナー", "エリプティカル"],
  "ローイングマシン": ["ローイングマシン", "ローイング"],
  "スキーエルゴ": ["スキーエルゴ"],
  "縄跳び": ["縄跳び", "なわとび"],
  "腹筋ローラー": ["腹筋ローラー", "アブローラー"],
  "TRX": ["trx", "サスペンショントレーナー"],
};

function hasEquipment(available: readonly string[], requirement: string): boolean {
  const aliases = equipmentAliases[requirement] ?? [requirement];
  return available.some((item) => {
    const normalized = item.toLocaleLowerCase().replaceAll(" ", "");
    return aliases.some((alias) => normalized.includes(alias.toLocaleLowerCase().replaceAll(" ", "")));
  });
}

export function usesRegisteredEquipment(name: string, available: string[]): boolean {
  const requirements = requirementsFor(name);
  return requirements.length > 0 && requirements.every((item) => hasEquipment(available, item));
}

export function fitsWorkoutLocation(name: string, isGymMember: boolean | undefined, equipment: readonly string[]): boolean {
  if (isGymMember === undefined || (isGymMember && equipment.length === 0)) return true;
  const required = requirementsFor(name);
  return isGymMember ? required.every((item) => hasEquipment(equipment, item)) : required.length === 0;
}

export function recommendExercises(input: {
  goal?: FitnessGoal;
  availableEquipment: string[];
  favorites: string[];
  customExercises?: CustomExercise[];
  workouts: WorkoutEntry[];
  selectedCategory: string;
  query: string;
  limit?: number;
  splitPlan?: WorkoutSplitPlan;
  date?: string;
  isGymMember?: boolean;
}): WorkoutSuggestion[] {
  const { goal = "maintain", availableEquipment, favorites, workouts, selectedCategory, query } = input;
  const search = normalizeExerciseSearch(query);
  const focus = selectedCategory !== "すべて" && selectedCategory !== "お気に入り"
    ? selectedCategory
    : detectMuscleFocus(search);
  const scheduledDay = input.splitPlan && input.date ? getWorkoutDayPlan(input.splitPlan, input.date) : undefined;
  if (scheduledDay?.isRest) return [];
  const useSchedule = scheduledDay && !focus && !search;
  const recentlyUsed = new Map<string, number>();
  for (const workout of workouts) {
    const daysAgo = Math.max(0, (Date.now() - new Date(`${workout.performedAt}T12:00:00`).getTime()) / 86_400_000);
    if (daysAgo > 28) continue;
    for (const exercise of workout.exercises) {
      const key = canonicalExerciseName(exercise.name);
      if (key && (!recentlyUsed.has(key) || daysAgo < (recentlyUsed.get(key) ?? Infinity))) recentlyUsed.set(key, daysAgo);
    }
  }

  const customCandidates = (input.customExercises ?? []).map(({ name, category }) => ({ name, category, group: "自分で追加した種目" }));
  const customNames = new Set(customCandidates.map((item) => item.name));
  const candidates = [...registrationExercises.filter((item) => !customNames.has(item.name)), ...customCandidates];
  const matchesQuery = (candidate: Omit<WorkoutSuggestion, "reasons">) =>
    matchesExerciseName(candidate.name, search) || normalizeExerciseSearch(`${candidate.category} ${candidate.group}`).includes(search);
  const ranked = candidates
    // Recommendations are deliberately restricted to the user's gym favorites.
    .filter((candidate) => favorites.includes(candidate.name))
    .filter((candidate) => selectedCategory === "すべて" || selectedCategory === "お気に入り" || candidate.category === selectedCategory)
    .filter((candidate) => !useSchedule || scheduledDay.categories.includes(candidate.category))
    .filter((candidate) => search.length < 2 || matchesQuery(candidate) || focus === candidate.category)
    .filter((candidate) => {
      if (input.isGymMember !== undefined) return fitsWorkoutLocation(candidate.name, input.isGymMember, availableEquipment);
      const requirements = requirementsFor(candidate.name);
      return availableEquipment.length === 0 || requirements.every((item) => hasEquipment(availableEquipment, item));
    })
    .map((candidate) => {
      let score = 0;
      const reasons: string[] = [];
      if (focus === candidate.category) { score += 4; reasons.push(`${candidate.category}を重点的に`); }
      if (useSchedule && scheduledDay.categories.includes(candidate.category)) { score += 4; reasons.push(`今日の${scheduledDay.label}の日に対応`); }
      if (search && matchesQuery(candidate)) { score += 2; reasons.push("入力内容に一致"); }
      if (favorites.includes(candidate.name)) { score += 3; reasons.push("お気に入り"); }

      const compound = /ベンチプレス|スクワット|デッドリフト|ロー|プレス|懸垂|プルアップ|ランジ/.test(candidate.name);
      if (goal === "build-muscle" && compound) { score += 2; reasons.push("筋力づくり向け"); }
      if (goal === "lose-fat" && (candidate.category === "有酸素" || compound)) { score += 2; reasons.push("活動量を高めやすい種目"); }
      if (goal === "maintain" && !compound) score += 0.5;

      const daysAgo = recentlyUsed.get(canonicalExerciseName(candidate.name));
      if (daysAgo !== undefined && daysAgo < 3) { score -= 3; reasons.push("直近に実施済み"); }
      else if (daysAgo !== undefined && daysAgo < 7) score -= 1;
      else if (daysAgo === undefined && workouts.length > 0) { score += 0.5; reasons.push("最近の記録にない種目"); }
      if (input.isGymMember !== false && availableEquipment.length > 0) { score += 1; if (reasons.length < 3) reasons.push("施設の器具で実施可能"); }
      return { ...candidate, score, reasons: reasons.slice(0, 2) };
    })
    .sort((first, second) => second.score - first.score || first.name.localeCompare(second.name, "ja"));

  const limit = input.limit ?? 5;
  const selected: typeof ranked = [];
  if (useSchedule && scheduledDay.categories.length > 1) {
    // Combined/full-body days should not be filled by a single body part.
    const priority = input.splitPlan?.kind === "full" ? ["胸", "背中", "脚", "肩", "腕", "腹筋・体幹"] : scheduledDay.categories;
    for (const category of priority) {
      const candidate = ranked.find((item) => item.category === category);
      if (candidate && selected.length < limit) selected.push(candidate);
    }
  }
  for (const candidate of ranked) {
    if (selected.length >= limit) break;
    if (!selected.some((item) => item.name === candidate.name)) selected.push(candidate);
  }
  return selected.map(({ name, category, group, reasons }) => ({ name, category, group, reasons }));
}
