// These queries supply candidate labels, never verified ground truth.
// Keep IDs aligned with lib/food-ai/photo-labels.json.
export const COMMONS_SOURCES = [
  { id: "rice", name: "白ご飯", categories: ["Cooked rice"], searches: ['"white rice" bowl'], terms: /white rice|steamed rice|cooked rice|白ご飯|白米|ご飯|飯碗/i },
  { id: "brown-rice", name: "玄米ご飯", categories: ["Cooked brown rice"], searches: ['"brown rice" cooked', '"brown rice" bowl', '玄米 ご飯'], terms: /brown rice|玄米/i },
  { id: "miso-soup", name: "味噌汁", categories: ["Miso soup"], searches: ['"miso soup"'], terms: /miso soup|misoshiru|味噌汁|みそ汁/i },
  { id: "natto", name: "納豆", categories: ["Nattō"], searches: ["natto"], terms: /natt[oō]|納豆/i },
  { id: "grilled-salmon", name: "焼き鮭", categories: ["Grilled salmon"], searches: ['"grilled salmon"'], terms: /grilled salmon|baked salmon|焼き鮭|焼鮭|サケの塩焼|鮭の塩焼/i },
  { id: "chicken-breast", name: "鶏むね肉", categories: ["Grilled chicken breasts"], searches: ['"grilled chicken breast"', '"baked chicken breast"', '"roasted chicken breast"', '"chicken breast" cooked', '鶏むね肉'], terms: /chicken breast|鶏むね|鶏胸/i },
  { id: "curry-rice", name: "カレーライス", categories: ["Japanese curry"], searches: ['"Japanese curry" rice'], terms: /Japanese curry|curry rice|カレーライス|カレー/i },
  { id: "beef-bowl", name: "牛丼", categories: ["Gyūdon"], searches: ["gyudon"], terms: /gy[uū]don|beef bowl|牛丼/i },
  { id: "rice-fried-vegetable", name: "野菜チャーハン", categories: ["Vegetable fried rice"], searches: ['"vegetable fried rice"', '"veggie fried rice"', '野菜 チャーハン'], terms: /vegetable fried rice|veggie fried rice|野菜チャーハン|野菜炒飯/i },
  { id: "ramen", name: "ラーメン", categories: ["Ramen"], searches: ['"ramen" noodles'], terms: /ramen|ラーメン|らーめん/i },
  { id: "soba", name: "そば", categories: ["Soba"], searches: ['"soba" noodles'], terms: /soba|蕎麦|そば/i },
  { id: "pasta", name: "トマトソースパスタ", categories: ["Pasta with tomato sauce"], searches: ['"pasta" "tomato sauce"'], terms: /tomato (?:sauce|pasta)|spaghetti pomodoro|pasta al pomodoro|トマトソース|トマトパスタ/i },
  { id: "sushi", name: "寿司", categories: ["Sushi"], searches: ['"sushi" plate'], terms: /sushi|寿司|すし/i },
  { id: "tofu", name: "豆腐", categories: ["Tofu dishes"], searches: ['"tofu" dish', 'hiyayakko', '冷奴', '湯豆腐'], terms: /tofu|豆腐|hiyayakko|冷奴/i },
  { id: "salad", name: "サラダ", categories: ["Green salads"], searches: ['"green salad"'], terms: /green salad|garden salad|vegetable salad|グリーンサラダ|野菜サラダ/i },
  { id: "fried-egg", name: "目玉焼き", categories: ["Fried eggs"], searches: ['"fried egg"'], terms: /fried egg|sunny.side.up|目玉焼き/i },
  { id: "omelette", name: "オムレツ", categories: ["Omelettes"], searches: ["omelette"], terms: /omelette|omelet|オムレツ/i },
  { id: "bread", name: "食パン・トースト", categories: ["Toast", "White breads"], searches: ['"white bread" toast', '"sliced white bread"', 'shokupan', '食パン'], terms: /white bread|toast|shokupan|食パン|トースト/i },
  { id: "banana", name: "バナナ", categories: ["Peeled bananas"], searches: ['"banana" plate'], terms: /banana|バナナ/i },
  { id: "yogurt", name: "プレーンヨーグルト", categories: ["Greek yogurt"], searches: ['"plain yogurt"', '"plain yoghurt"', '"Greek yogurt" bowl', '"Greek yoghurt"', 'プレーンヨーグルト'], terms: /(?:Greek|plain) yog[hu]?urt|(?:Greek|plain) yogurt|プレーンヨーグルト|ギリシャヨーグルト/i },
  { id: "protein-shake", name: "プロテインドリンク", categories: ["Protein shakes"], searches: ['"protein shake"', '"protein smoothie"', '"whey protein" drink'], terms: /protein shake|protein smoothie|whey protein|プロテイン/i },
  { id: "hamburger-steak", name: "ハンバーグ", categories: ["Hamburg steak"], searches: ['"hamburg steak"'], terms: /hamburg steak|hamburger steak|ハンバーグ/i },
  { id: "pizza", name: "ピザ", categories: ["Cheese pizzas"], searches: ['"cheese pizza"'], terms: /pizza|ピザ/i },
  { id: "hamburger", name: "ハンバーガー", categories: ["Hamburgers"], searches: ['"hamburger" food'], terms: /hamburger|burger|ハンバーガー/i },
  { id: "chicken-nuggets", name: "チキンナゲット", categories: ["Chicken nuggets"], searches: ['"chicken nuggets"'], terms: /chicken nugget|チキンナゲット/i },
  { id: "potato-fries", name: "フライドポテト", categories: ["French fries"], searches: ['"french fries"'], terms: /french fries|fries|フライドポテト/i },
  { id: "shrimp-grilled", name: "焼きえび", categories: ["Grilled shrimp"], searches: ['"grilled shrimp"', '"grilled prawns"'], terms: /grilled (?:shrimp|prawn)|焼きえび|焼きエビ|海老の塩焼|エビの塩焼/i },
  { id: "edamame", name: "枝豆", categories: ["Edamame"], searches: ['"edamame" bowl', '"shelled edamame"', '"edamame" pods', '枝豆'], terms: /edamame|枝豆|えだまめ/i },
];

export const COMMONS_QUERIES = COMMONS_SOURCES.flatMap((source) => [
  ...source.categories.map((value) => ({ key: `${source.id}:category:${value}`, labelId: source.id, kind: "category", value })),
  ...source.searches.map((value) => ({ key: `${source.id}:search:${value}`, labelId: source.id, kind: "search", value })),
]);
