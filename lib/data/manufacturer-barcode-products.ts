type ManufacturerProduct = {
  name: string;
  brand: string;
  packageAmount: number;
  unit: "g" | "ml";
  nutrition: { calories: number; proteinG: number; fatG: number; carbsG: number };
  sourceUrl: string;
};

// Nutrition is the manufacturer's value for the full stated package.
export const manufacturerBarcodeProducts: Readonly<Partial<Record<string, ManufacturerProduct>>> = {
  "4902105252482": {
    name: "あっさりおいしいカップヌードル", brand: "日清食品", packageAmount: 57, unit: "g",
    nutrition: { calories: 265, proteinG: 6.9, fatG: 11.8, carbsG: 32.7 },
    sourceUrl: "https://www.nissin.com/jp/product/items/13794/",
  },
  "4902105286883": {
    name: "カップヌードルPRO", brand: "日清食品", packageAmount: 75, unit: "g",
    nutrition: { calories: 292, proteinG: 16.8, fatG: 18.1, carbsG: 34 },
    sourceUrl: "https://www.nissin.com/jp/product/items/12975/",
  },
  "4902105286890": {
    name: "カップヌードルPRO シーフードヌードル", brand: "日清食品", packageAmount: 78, unit: "g",
    nutrition: { calories: 282, proteinG: 16.1, fatG: 15.4, carbsG: 39.5 },
    sourceUrl: "https://www.nissin.com/jp/product/items/12976/",
  },
  "4902105289549": {
    name: "カップヌードルPRO カレー", brand: "日清食品", packageAmount: 85, unit: "g",
    nutrition: { calories: 356, proteinG: 15.8, fatG: 22.8, carbsG: 41.1 },
    sourceUrl: "https://www.nissin.com/jp/product/items/13336/",
  },
  "4902105987322": {
    name: "完全メシ カレーメシ 欧風カレー", brand: "日清食品", packageAmount: 119, unit: "g",
    nutrition: { calories: 483, proteinG: 20.1, fatG: 15, carbsG: 70.3 },
    sourceUrl: "https://www.nissin.com/jp/product/items/13253/",
  },
  "4902105978986": {
    name: "完全メシ 日清のどん兵衛 カレーうどん", brand: "日清食品", packageAmount: 112, unit: "g",
    nutrition: { calories: 452, proteinG: 17.9, fatG: 13.4, carbsG: 67.9 },
    sourceUrl: "https://www.nissin.com/jp/product/items/13263/",
  },
  "4902705033863": {
    name: "ザバス MILK PROTEIN 脂肪0 ミルク風味", brand: "明治", packageAmount: 200, unit: "ml",
    nutrition: { calories: 102, proteinG: 15, fatG: 0, carbsG: 10.6 },
    sourceUrl: "https://www.meiji.co.jp/products/sports/4902705033863.html",
  },
  "4902705014541": {
    name: "ザバス MILK PROTEIN 脂肪0 ココア風味", brand: "明治", packageAmount: 200, unit: "ml",
    nutrition: { calories: 103, proteinG: 15, fatG: 0, carbsG: 10.8 },
    sourceUrl: "https://www.meiji.co.jp/products/sports/4902705014541.html",
  },
  "4902705018099": {
    name: "ザバス MILK PROTEIN 脂肪0 バナナ風味", brand: "明治", packageAmount: 200, unit: "ml",
    nutrition: { calories: 103, proteinG: 15, fatG: 0, carbsG: 10.8 },
    sourceUrl: "https://www.meiji.co.jp/products/sports/4902705018099.html",
  },
  "4902705099425": {
    name: "ザバス MILK PROTEIN 脂肪0 ストロベリー風味", brand: "明治", packageAmount: 200, unit: "ml",
    nutrition: { calories: 107, proteinG: 20, fatG: 0, carbsG: 6.9 },
    sourceUrl: "https://www.meiji.co.jp/products/sports/4902705099425.html",
  },
};
