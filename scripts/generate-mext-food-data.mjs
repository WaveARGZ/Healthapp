import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

const sourceUrl = "https://www.mext.go.jp/content/20260327-mxt_kagsei-mext-000029402_02.xlsx";
const sourceName = "日本食品標準成分表（八訂）増補2023年";
const sourcePage = "https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html";
const inputPath = process.argv[2];

if (!inputPath) {
  throw new Error("Excelファイルのパスを渡してください。例: npm run generate:food-data -- /tmp/mext.xlsx");
}

function parseCsv(input) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field || row.length) rows.push([...row, field]);
  return rows;
}

function numericValue(raw) {
  const value = raw.trim();
  if (!value || value === "-" || value === "*") return undefined;
  if (value === "Tr" || value === "(Tr)" || value === "(0)") return 0;
  const parsed = Number(value.replace(/[()]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function compactText(value) {
  return value.replace(/\s+/g, " ").trim();
}

const input = resolve(inputPath);
const csvDirectory = "/tmp/bodymake-mext-csv";
await mkdir(csvDirectory, { recursive: true });
execFileSync("soffice", ["--headless", "--convert-to", "csv", "--outdir", csvDirectory, input], { stdio: "inherit" });
const csvPath = `${csvDirectory}/${basename(input, ".xlsx")}.csv`;
const rows = parseCsv(await readFile(csvPath, "utf8"));
const foods = rows.flatMap((row) => {
  const code = row[1]?.trim();
  const name = compactText(row[3] ?? "");
  const calories = numericValue(row[6] ?? "");
  if (!/^\d{5}$/.test(code ?? "") || !name || calories === undefined) return [];
  return [{
    code,
    group: compactText(row[0] ?? ""),
    name,
    calories,
    proteinG: numericValue(row[9] ?? ""),
    fatG: numericValue(row[12] ?? ""),
    carbsG: numericValue(row[20] ?? ""),
  }];
});

const output = {
  version: "2023-supplement-corrected-2026-03-27",
  sourceName,
  sourceUrl: sourcePage,
  sourceDataUrl: sourceUrl,
  basis: "可食部100g当たり",
  foods,
};
const outputPath = resolve("public/data/mext-foods-2023.json");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output)}\n`);
console.log(`${foods.length} foods written to ${outputPath}`);
