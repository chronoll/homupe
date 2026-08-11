import { getRecipes } from "@/lib/delish";
import RecipeList from "@/components/RecipeList";

// SSG: ビルド時に一度だけDelishKitchen APIへアクセスし、以降はリクエストごとにアクセスしない
export const dynamic = "force-static";

export default async function RecipesPage() {
  const recipes = await getRecipes();
  return <RecipeList recipes={recipes} />;
}
