import type { Recipe } from "@/lib/types";

// お気に入りレシピのID一覧。
// 現状は動的取得ではなく固定リスト（仮）。後でDB等から差し替え可能。
export const FAVORITE_RECIPE_IDS = [
  "211399971704931546",
  "118464336288022852",
  "322250608830579949",
  "364475120317629574",
];

const API_BASE = "https://api2.delishkitchen.tv/web/recipes";

// DelishKitchen Web API は専用 User-Agent を要求する
const API_USER_AGENT = "DelishWebApi";

interface DelishMeasure {
  value: number;
  unit: string;
  prefix?: string;
  suffix?: string;
}

interface DelishRecipeResponse {
  data: {
    id_str: string;
    title: string;
    lead?: string;
    description?: string;
    square_video?: {
      poster_url?: string;
      webp_poster_url?: string;
    } | null;
    recipe_detail?: {
      cooking_time?: DelishMeasure;
      cooking_cost?: DelishMeasure;
      calorie?: DelishMeasure;
    } | null;
    recipe_category?: { name?: string } | null;
  };
}

function formatMeasure(m?: DelishMeasure): string | null {
  if (!m) return null;
  return `${m.prefix ?? ""}${m.value}${m.unit}${m.suffix ?? ""}`;
}

export async function getRecipe(id: string): Promise<Recipe | null> {
  try {
    const res = await fetch(`${API_BASE}/${id}`, {
      headers: { "User-Agent": API_USER_AGENT },
    });
    if (!res.ok) return null;

    const json: DelishRecipeResponse = await res.json();
    const data = json.data;
    const detail = data.recipe_detail;

    return {
      id: data.id_str,
      title: data.title,
      lead: data.lead ?? "",
      description: data.description ?? "",
      imageUrl:
        data.square_video?.webp_poster_url ||
        data.square_video?.poster_url ||
        "",
      url: `https://delishkitchen.tv/recipes/${data.id_str}`,
      cookingTime: formatMeasure(detail?.cooking_time),
      cookingCost: formatMeasure(detail?.cooking_cost),
      calorie: formatMeasure(detail?.calorie),
      category: data.recipe_category?.name ?? null,
    };
  } catch {
    return null;
  }
}

export async function getRecipes(): Promise<Recipe[]> {
  const results = await Promise.all(FAVORITE_RECIPE_IDS.map(getRecipe));
  return results.filter((r): r is Recipe => r !== null);
}
