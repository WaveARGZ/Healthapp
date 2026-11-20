import type { WorkoutExerciseCategory } from "../../types/workout-preferences";
import { exerciseEquipmentOrder, type ExerciseEquipmentGroup } from "./exercise-catalog.ts";
import type { facilityEquipmentOptions } from "./facility-equipment-options";

type Equipment = (typeof facilityEquipmentOptions)[number];

interface ExerciseDefinition {
  name: string;
  requiredEquipment: Equipment[];
  previousName?: string;
  aliases?: string[];
}

interface RegistrationExercise extends ExerciseDefinition {
  category: WorkoutExerciseCategory;
  group: ExerciseEquipmentGroup;
}

function exercise(name: string, requiredEquipment: Equipment[] = [], names?: Pick<ExerciseDefinition, "previousName" | "aliases">): ExerciseDefinition {
  return { name, requiredEquipment, ...names };
}

// Put frequently used basics first within each equipment group.
const menu: Record<WorkoutExerciseCategory, Partial<Record<ExerciseEquipmentGroup, ExerciseDefinition[]>>> = {
  "胸": {
    "マシーン種目": [
      exercise("チェストプレス", ["ウェイトマシン"]),
      exercise("ペックフライ", ["ウェイトマシン"], { previousName: "ペックデックフライ", aliases: ["バタフライ", "ペックデック"] }),
      exercise("ケーブルフライ", ["ケーブルマシン"], { aliases: ["ケーブルクロスオーバー"] }),
      exercise("スミスマシンベンチプレス", ["スミスマシン", "ベンチ"]),
    ],
    "バーベル種目": [
      exercise("ベンチプレス", ["バーベル", "ベンチ"], { previousName: "バーベルベンチプレス", aliases: ["フラットベンチプレス"] }),
      exercise("インクラインバーベルベンチプレス", ["バーベル", "ベンチ"], { aliases: ["インクラインベンチプレス"] }),
    ],
    "ダンベル種目": [
      exercise("ダンベルベンチプレス", ["ダンベル", "ベンチ"], { aliases: ["ダンベルプレス"] }),
      exercise("インクラインダンベルプレス", ["ダンベル", "ベンチ"]),
      exercise("ダンベルフライ", ["ダンベル", "ベンチ"]),
    ],
    "その他・自重": [
      exercise("腕立て伏せ", [], { previousName: "プッシュアップ" }),
      exercise("膝つき腕立て伏せ", [], { previousName: "膝つきプッシュアップ" }),
      exercise("インクラインプッシュアップ", [], { aliases: ["台を使った腕立て伏せ"] }),
      exercise("壁腕立て伏せ", [], { previousName: "壁プッシュアップ" }),
      exercise("チェストディップス", ["ディップスバー"], { aliases: ["ディップス"] }),
    ],
  },
  "背中": {
    "マシーン種目": [
      exercise("ラットプルダウン", ["ウェイトマシン"], { aliases: ["ラットプル", "ラットプルダウンマシン"] }),
      exercise("シーテッドロー", ["ウェイトマシン"], { aliases: ["シーテッドロウ", "シーテッドローイング"] }),
      exercise("シーテッドケーブルロー", ["ケーブルマシン"], { aliases: ["ケーブルロー", "ケーブルロウ"] }),
      exercise("アシスト懸垂", ["ウェイトマシン"], { aliases: ["アシストプルアップ", "アシストチンニング"] }),
      exercise("ストレートアームプルダウン", ["ケーブルマシン"]),
      exercise("バックエクステンション", ["ウェイトマシン"], { aliases: ["背筋台"] }),
    ],
    "バーベル種目": [
      exercise("ベントオーバーロー", ["バーベル"], { aliases: ["ベントオーバーロウ", "バーベルロー", "バーベルロウ"] }),
      exercise("デッドリフト", ["バーベル"], { aliases: ["バーベルデッドリフト"] }),
    ],
    "ダンベル種目": [
      exercise("ダンベルローイング", ["ダンベル"], { previousName: "ダンベルロウ", aliases: ["ダンベルロー", "ワンハンドローイング", "ワンハンドダンベルロー"] }),
      exercise("チェストサポートダンベルロー", ["ダンベル", "ベンチ"], { aliases: ["チェストサポートロウ"] }),
    ],
    "その他・自重": [
      exercise("懸垂", ["懸垂バー"], { aliases: ["チンニング", "プルアップ"] }),
      exercise("チンアップ", ["懸垂バー"], { aliases: ["逆手懸垂"] }),
      exercise("バードドッグ"),
      exercise("スーパーマン"),
    ],
  },
  "腕": {
    "マシーン種目": [
      exercise("ケーブルカール", ["ケーブルマシン"]),
      exercise("トライセプスプッシュダウン", ["ケーブルマシン"], { aliases: ["プレスダウン", "プッシュダウン"] }),
      exercise("ケーブルオーバーヘッドトライセプスエクステンション", ["ケーブルマシン"]),
      exercise("マシンプリーチャーカール", ["ウェイトマシン"]),
    ],
    "バーベル種目": [
      exercise("バーベルカール", ["バーベル"]),
      exercise("EZバーカール", ["バーベル"], { aliases: ["イージーバーカール"] }),
      exercise("ナローベンチプレス", ["バーベル", "ベンチ"], { aliases: ["クローズグリップベンチプレス"] }),
    ],
    "ダンベル種目": [
      exercise("ダンベルカール", ["ダンベル"], { aliases: ["アームカール", "バイセプスカール"] }),
      exercise("ハンマーカール", ["ダンベル"]),
      exercise("インクラインダンベルカール", ["ダンベル", "ベンチ"]),
      exercise("ダンベルトライセプスキックバック", ["ダンベル"], { previousName: "キックバック" }),
      exercise("ダンベルオーバーヘッドトライセプスエクステンション", ["ダンベル"], { aliases: ["フレンチプレス"] }),
    ],
    "その他・自重": [
      exercise("ナロープッシュアップ", [], { aliases: ["ナロー腕立て伏せ"] }),
      exercise("ディップス", ["ディップスバー"]),
      exercise("タオルカール"),
    ],
  },
  "肩": {
    "マシーン種目": [
      exercise("マシンショルダープレス", ["ウェイトマシン"]),
      exercise("マシンサイドレイズ", ["ウェイトマシン"]),
      exercise("リバースペックデック", ["ウェイトマシン"], { aliases: ["リバースペックフライ", "リアデルトフライ"] }),
      exercise("ケーブルサイドレイズ", ["ケーブルマシン"]),
      exercise("フェイスプル", ["ケーブルマシン"]),
    ],
    "バーベル種目": [
      exercise("バーベルショルダープレス", ["バーベル"], { aliases: ["オーバーヘッドプレス", "ミリタリープレス"] }),
    ],
    "ダンベル種目": [
      exercise("ダンベルショルダープレス", ["ダンベル"]),
      exercise("ダンベルサイドレイズ", ["ダンベル"], { previousName: "サイドレイズ", aliases: ["ラテラルレイズ"] }),
      exercise("ダンベルリアレイズ", ["ダンベル"], { aliases: ["リアレイズ", "リアデルトレイズ"] }),
      exercise("アーノルドプレス", ["ダンベル"]),
    ],
    "その他・自重": [exercise("パイクプッシュアップ")],
  },
  "腹筋・体幹": {
    "マシーン種目": [
      exercise("アブドミナルクランチ", ["ウェイトマシン"], { aliases: ["腹筋マシン", "マシンクランチ"] }),
      exercise("ケーブルクランチ", ["ケーブルマシン"]),
      exercise("パロフプレス", ["ケーブルマシン"]),
    ],
    "その他・自重": [
      exercise("クランチ"),
      exercise("プランク"),
      exercise("サイドプランク"),
      exercise("デッドバグ"),
      exercise("サイドクランチ"),
      exercise("リバースクランチ"),
      exercise("レッグレイズ"),
      exercise("ハンギングニーレイズ", ["懸垂バー"]),
      exercise("腹筋ローラー（膝コロ）", ["腹筋ローラー"], { aliases: ["アブローラー", "膝コロ"] }),
    ],
  },
  "脚": {
    "マシーン種目": [
      exercise("レッグプレス", ["ウェイトマシン"]),
      exercise("レッグエクステンション", ["ウェイトマシン"]),
      exercise("シーテッドレッグカール", ["ウェイトマシン"], { aliases: ["座位レッグカール"] }),
      exercise("ライイングレッグカール", ["ウェイトマシン"], { aliases: ["うつ伏せレッグカール"] }),
      exercise("ヒップアダクション", ["ウェイトマシン"], { previousName: "アダクション", aliases: ["内もも"] }),
      exercise("ヒップアブダクション", ["ウェイトマシン"], { previousName: "アブダクション" }),
      exercise("ハックスクワット", ["ウェイトマシン"]),
      exercise("シーテッドカーフレイズ", ["ウェイトマシン"]),
    ],
    "バーベル種目": [
      exercise("バーベルスクワット", ["バーベル"], { aliases: ["バックスクワット"] }),
      exercise("ルーマニアンデッドリフト", ["バーベル"], { aliases: ["RDL", "バーベルルーマニアンデッドリフト"] }),
      exercise("バーベルヒップスラスト", ["バーベル", "ベンチ"]),
    ],
    "ダンベル種目": [
      exercise("ゴブレットスクワット", ["ダンベル"], { aliases: ["ダンベルゴブレットスクワット"] }),
      exercise("ダンベルブルガリアンスクワット", ["ダンベル", "ベンチ"], { aliases: ["ブルガリアンスクワット", "ブルガリアンスプリットスクワット"] }),
      exercise("ダンベルルーマニアンデッドリフト", ["ダンベル"], { aliases: ["ダンベルRDL"] }),
      exercise("ダンベルランジ", ["ダンベル"]),
    ],
    "その他・自重": [
      exercise("自重スクワット"),
      exercise("ランジ"),
      exercise("リバースランジ"),
      exercise("ステップアップ"),
      exercise("ヒップリフト", [], { aliases: ["グルートブリッジ"] }),
      exercise("スタンディングカーフレイズ", [], { aliases: ["カーフレイズ", "かかと上げ"] }),
      exercise("ウォールシット", [], { aliases: ["空気椅子"] }),
    ],
  },
  "有酸素": {
    "マシーン種目": [
      exercise("トレッドミル", ["トレッドミル"], { aliases: ["ランニングマシン"] }),
      exercise("エアロバイク", ["エアロバイク"], { aliases: ["フィットネスバイク"] }),
      exercise("クロストレーナー", ["クロストレーナー"], { aliases: ["エリプティカル"] }),
      exercise("ローイングマシン", ["ローイングマシン"]),
    ],
    "その他・自重": [
      exercise("ウォーキング"),
      exercise("早歩き"),
      exercise("ジョギング"),
      exercise("ランニング"),
      exercise("その場足踏み"),
      exercise("階段昇降"),
      exercise("縄跳び", ["縄跳び"], { aliases: ["なわとび"] }),
    ],
  },
};

export const registrationExercises: RegistrationExercise[] = Object.entries(menu).flatMap(([category, groups]) =>
  exerciseEquipmentOrder.flatMap((group) => (groups[group] ?? []).map((item) => ({
    ...item, category: category as WorkoutExerciseCategory, group,
  }))),
);

/** Normalize punctuation and kana for search while keeping the display name intact. */
export function normalizeExerciseSearch(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[\s・･‐‑–—−-]/g, "")
    .replace(/[\u3041-\u3096]/g, (kana) => String.fromCharCode(kana.charCodeAt(0) + 0x60));
}

const exercisesByName = new Map(registrationExercises.map((item) => [item.name, item]));
const exercisesByPreviousName = new Map(registrationExercises.flatMap((item) => item.previousName ? [[item.previousName, item] as const] : []));

/** Only known renames share a history key. Search aliases can describe several variants. */
export function registeredExerciseForName(name: string): RegistrationExercise | undefined {
  const key = name.trim();
  return exercisesByName.get(key) ?? exercisesByPreviousName.get(key);
}

export function canonicalExerciseName(name: string): string {
  return registeredExerciseForName(name)?.name ?? name.trim();
}

export function matchesExerciseName(name: string, query: string): boolean {
  const needle = normalizeExerciseSearch(query);
  if (!needle) return true;
  const item = registeredExerciseForName(name);
  const variants = item ? [item.name, item.previousName ?? "", ...(item.aliases ?? [])] : [name];
  return variants.some((variant) => normalizeExerciseSearch(variant).includes(needle));
}
