"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { lookupBarcodeProduct, normalizeBarcode, scaleBarcodeNutrition, type BarcodeNutrition, type BarcodeProduct } from "@/lib/food-barcode";
import type { MealFoodItem } from "@/types/meal";

interface BarcodeMealEntryProps {
  onAddFood: (food: Omit<MealFoodItem, "id">) => Promise<void>;
  barcode: string;
  onBarcodeChange: (value: string) => void;
}

type NutritionKey = keyof BarcodeNutrition;
type NutritionDrafts = Record<NutritionKey, string>;
const nutritionFields: Array<[NutritionKey, string, string]> = [
  ["calories", "カロリー", "kcal"],
  ["proteinG", "たんぱく質", "g"],
  ["fatG", "脂質", "g"],
  ["carbsG", "炭水化物", "g"],
];

function nutritionDrafts(nutrition: BarcodeNutrition): NutritionDrafts {
  return {
    calories: nutrition.calories?.toString() ?? "",
    proteinG: nutrition.proteinG?.toString() ?? "",
    fatG: nutrition.fatG?.toString() ?? "",
    carbsG: nutrition.carbsG?.toString() ?? "",
  };
}

function validAmount(value: string): boolean {
  const amount = Number(value);
  return value.trim() !== "" && Number.isFinite(amount) && amount > 0 && amount <= 3000;
}

export function BarcodeMealEntry({ onAddFood, barcode, onBarcodeChange }: BarcodeMealEntryProps) {
  const [scanning, setScanning] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [product, setProduct] = useState<BarcodeProduct | null>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("100");
  const [unit, setUnit] = useState<"g" | "ml">("g");
  const [drafts, setDrafts] = useState<NutritionDrafts>(nutritionDrafts({}));
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const lookupAbort = useRef<AbortController | null>(null);
  const saveLock = useRef(false);

  const searchBarcode = useCallback(async (rawCode: string) => {
    lookupAbort.current?.abort();
    setProduct(null);
    const code = normalizeBarcode(rawCode);
    if (!code) {
      setIsLookingUp(false);
      setNotice("8〜14桁のバーコード番号を入力してください。");
      return;
    }
    const controller = new AbortController();
    lookupAbort.current = controller;
    onBarcodeChange(code);
    setIsLookingUp(true);
    setNotice("商品を検索しています…");
    try {
      const found = await lookupBarcodeProduct(code, controller.signal);
      if (controller.signal.aborted) return;
      if (!found) {
        setNotice("商品が見つかりませんでした。番号を確認するか、手入力から登録してください。");
        return;
      }
      setProduct(found);
      setName(found.name);
      setAmount(String(found.suggestedAmount));
      setUnit(found.amountUnit);
      setDrafts(nutritionDrafts(scaleBarcodeNutrition(found.per100, found.suggestedAmount)));
      setNotice(found.name ? "商品情報を確認し、食べた量と栄養値を直してから保存してください。" : "商品名が未登録です。パッケージを確認して入力してください。");
    } catch {
      if (!controller.signal.aborted) setNotice("商品を検索できませんでした。通信状態を確認するか、手入力から登録してください。");
    } finally {
      if (!controller.signal.aborted) setIsLookingUp(false);
    }
  }, [onBarcodeChange]);

  useEffect(() => () => lookupAbort.current?.abort(), []);

  useEffect(() => {
    if (!scanning) return;
    let cancelled = false;
    let scanner: IScannerControls | null = null;
    const video = videoRef.current;
    void (async () => {
      const { BrowserMultiFormatOneDReader } = await import("@zxing/browser");
      if (cancelled || !video) return;
      const reader = new BrowserMultiFormatOneDReader();
      scanner = await reader.decodeFromVideoDevice(undefined, video, (result, _error, controls) => {
        const code = result && normalizeBarcode(result.getText());
        if (!code || cancelled) return;
        controls.stop();
        setScanning(false);
        void searchBarcode(code);
      });
      if (cancelled) scanner.stop();
    })().catch(() => {
      if (!cancelled) {
        setScanning(false);
        setNotice("カメラを起動できませんでした。カメラの許可を確認するか、番号を入力してください。");
      }
    });
    return () => {
      cancelled = true;
      scanner?.stop();
      if (video?.srcObject instanceof MediaStream) video.srcObject.getTracks().forEach((track) => track.stop());
      if (video) video.srcObject = null;
    };
  }, [scanning, searchBarcode]);

  function changeAmount(value: string) {
    setAmount(value);
    if (product && validAmount(value)) setDrafts(nutritionDrafts(scaleBarcodeNutrition(product.per100, Number(value))));
  }

  async function saveProduct() {
    if (!product || !name.trim() || !validAmount(amount) || saveLock.current) return;
    const nutrition: BarcodeNutrition = {};
    for (const [key] of nutritionFields) {
      if (drafts[key].trim() === "") continue;
      const value = Number(drafts[key]);
      if (!Number.isFinite(value) || value < 0 || value > 10000) {
        setNotice("カロリー・PFCは0〜10,000の数値で入力してください。");
        return;
      }
      nutrition[key] = value;
    }
    saveLock.current = true;
    setIsSaving(true);
    setNotice("食事を記録しています…");
    try {
      const quantity = Number(amount);
      await onAddFood({
        name: `${name.trim()}（${quantity}${unit}）`,
        ...nutrition,
        sourceBarcode: product.code,
        ...(unit === "g" ? { portionGrams: quantity, portionUnit: unit, portionQuantity: quantity } : {}),
      });
      setProduct(null);
      setScanning(false);
      setNotice(`${name.trim()}を食事に保存しました。`);
    } catch {
      setNotice("食事を保存できませんでした。通信状態を確認して、もう一度お試しください。");
    } finally {
      saveLock.current = false;
      setIsSaving(false);
    }
  }

  return <section className="mt-5 rounded-2xl border border-[var(--line)] bg-[var(--sand)] p-4 sm:p-5">
    <h3 className="text-sm font-bold text-[var(--ink)]">バーコードから商品を登録</h3>
    <p className="mt-2 text-xs leading-6 text-[var(--muted)]">市販食品のバーコードを読み取り、商品情報を確認してから食事に追加します。</p>
    <Button type="button" variant="secondary" className="mt-4 flex min-h-12 w-full items-center justify-center gap-2" onClick={() => { setScanning((current) => !current); setNotice(""); }} disabled={isSaving}>
      <Icon name="barcode" className="size-5" />{scanning ? "カメラを停止" : "カメラでバーコードを読む"}
    </Button>
    {scanning && <div className="mt-3 overflow-hidden rounded-xl bg-black"><video ref={videoRef} autoPlay muted playsInline aria-label="バーコード読み取りカメラ" className="aspect-[4/3] w-full object-cover" /><p className="bg-[var(--ink)] px-3 py-2 text-center text-xs text-white">商品の線状バーコードを画面中央に合わせてください</p></div>}
    <label className="mt-4 block text-xs font-bold text-[var(--ink)]">バーコード番号を入力
      <input value={barcode} onChange={(event) => { lookupAbort.current?.abort(); setIsLookingUp(false); onBarcodeChange(event.target.value); setProduct(null); setNotice(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); setScanning(false); void searchBarcode(barcode); } }} inputMode="numeric" autoComplete="off" placeholder="例：3017620422003" className="form-input mt-2" />
    </label>
    <Button type="button" className="mt-3 w-full" onClick={() => { setScanning(false); void searchBarcode(barcode); }} disabled={isLookingUp || isSaving || !normalizeBarcode(barcode)}>{isLookingUp ? "検索中…" : "商品を検索"}</Button>
    {product && <div className="mt-5 rounded-xl border border-[var(--line)] bg-white p-4">
      <p className="text-xs font-bold text-[var(--sage-deep)]">検索した商品</p>
      <p className="mt-1 text-sm font-semibold text-[var(--ink)]">{product.name || "商品名未登録"}{product.brand ? ` · ${product.brand}` : ""}</p>
      {product.packageQuantity && <p className="mt-1 text-xs text-[var(--muted)]">内容量：{product.packageQuantity}</p>}
      <a href={product.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs text-[var(--sage-deep)] underline">出典：Open Food Factsで商品情報を見る</a>
      <label className="mt-4 block text-xs font-bold text-[var(--ink)]">登録する商品名<input value={name} onChange={(event) => setName(event.target.value)} className="form-input mt-2" placeholder="商品名を入力" /></label>
      <div className="mt-4 flex items-end gap-3"><label className="min-w-0 flex-1 text-xs font-bold text-[var(--ink)]">食べた量<input type="number" min="1" max="3000" step="any" inputMode="decimal" value={amount} onChange={(event) => changeAmount(event.target.value)} className="form-input mt-2" /></label><label className="text-xs font-bold text-[var(--ink)]">単位<select value={unit} onChange={(event) => setUnit(event.target.value as "g" | "ml")} className="form-input mt-2 min-w-20"><option value="g">g</option><option value="ml">ml</option></select></label></div>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">栄養値は登録された100g／100mlあたりの値から計算します。量を変更すると推定値を再計算します。</p>
      <fieldset className="mt-4"><legend className="text-xs font-bold text-[var(--ink)]">登録する栄養値（修正できます）</legend><div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">{nutritionFields.map(([key, label, suffix]) => <label key={key} className="min-w-0 text-xs font-medium text-[var(--muted)]">{label}（{suffix}）<input type="number" min="0" max="10000" step="any" inputMode="decimal" placeholder="未入力" value={drafts[key]} onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))} className="form-input mt-2 min-w-0" /></label>)}</div></fieldset>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">空欄は未入力として保存します。パッケージの表示と照らして確認してください。</p>
      <Button type="button" className="mt-4 w-full" onClick={() => void saveProduct()} disabled={!name.trim() || !validAmount(amount) || isSaving}>{isSaving ? "保存中…" : "この商品を食事に追加"}</Button>
    </div>}
    {notice && <p role="status" className="mt-3 text-sm leading-6 text-[var(--muted)]">{notice}</p>}
    <p className="mt-4 text-xs leading-5 text-[var(--muted)]">カメラ映像は保存しません。商品検索時はバーコード番号だけをOpen Food Factsへ送信します。</p>
  </section>;
}
