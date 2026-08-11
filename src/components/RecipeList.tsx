import { PageLayout, ContentFrame } from "@/components/PageLayout";
import type { Recipe } from "@/lib/types";

interface RecipeListProps {
  recipes: Recipe[];
}

function MetaItem({ icon, label }: { icon: string; label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontSize: 11,
        color: "#868e96",
      }}
    >
      <span aria-hidden>{icon}</span>
      {label}
    </span>
  );
}

function RecipeCard({ recipe }: { recipe: Recipe }) {
  return (
    <a
      href={recipe.url}
      target="_blank"
      rel="noopener noreferrer"
      className="video-card"
      style={{
        display: "block",
        textDecoration: "none",
        color: "inherit",
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: "#fff",
        boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
      }}
    >
      <div style={{ position: "relative" }}>
        {recipe.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={recipe.imageUrl}
            alt={recipe.title}
            style={{
              display: "block",
              width: "100%",
              aspectRatio: "1 / 1",
              objectFit: "cover",
            }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              aspectRatio: "1 / 1",
              backgroundColor: "#e9ecef",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ fontSize: 36, color: "#adb5bd" }}>🍽️</span>
          </div>
        )}
        {recipe.category && (
          <span
            style={{
              position: "absolute",
              top: 10,
              left: 10,
              fontSize: 11,
              fontWeight: 700,
              color: "#fff",
              backgroundColor: "#ff6b35",
              borderRadius: 4,
              padding: "2px 8px",
            }}
          >
            {recipe.category}
          </span>
        )}
      </div>
      <div style={{ padding: "12px 14px 14px" }}>
        <h3
          style={{
            margin: 0,
            fontSize: 15,
            fontWeight: 700,
            fontFamily: "'Noto Sans JP', sans-serif",
            color: "#2d3436",
            lineHeight: 1.4,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {recipe.title}
        </h3>
        {recipe.lead && (
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 12,
              fontWeight: 600,
              color: "#e8590c",
              lineHeight: 1.4,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {recipe.lead}
          </p>
        )}
        <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 10 }}>
          {recipe.cookingTime && <MetaItem icon="⏱" label={recipe.cookingTime} />}
          {recipe.cookingCost && <MetaItem icon="💰" label={recipe.cookingCost} />}
          {recipe.calorie && <MetaItem icon="🔥" label={recipe.calorie} />}
        </div>
      </div>
    </a>
  );
}

export default function RecipeList({ recipes }: RecipeListProps) {
  return (
    <PageLayout title="お気に入りレシピ" maxWidth={900}>
      <ContentFrame>
        {recipes.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center" }}>
            <p
              style={{
                fontFamily: "'Noto Sans JP', sans-serif",
                color: "#868e96",
                fontStyle: "italic",
                margin: 0,
              }}
            >
              レシピがありません
            </p>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 16,
              padding: 20,
            }}
          >
            {recipes.map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} />
            ))}
          </div>
        )}
      </ContentFrame>
      <p
        style={{
          textAlign: "center",
          marginTop: 16,
          fontSize: 12,
          color: "#adb5bd",
          fontFamily: "'Noto Sans JP', sans-serif",
        }}
      >
        レシピ情報提供:{" "}
        <a
          href="https://delishkitchen.tv"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#868e96" }}
        >
          DELISH KITCHEN
        </a>
      </p>
    </PageLayout>
  );
}
