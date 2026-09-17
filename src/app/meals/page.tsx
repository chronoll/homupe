/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import { groupMealPhotos, listMealPhotos, type MealPhotoGroup } from "@/lib/meals";
import styles from "./meals.module.css";

export const metadata: Metadata = {
  title: "食事の記録",
  description: "日々の食事を写真で記録しています。",
};

// Uploads invalidate this page immediately. The daily fallback bounds Blob list()
// operations if a write-side invalidation is ever missed.
export const revalidate = 86_400;

function displayDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${year}年${Number(month)}月${Number(day)}日`;
}

async function loadGroups(): Promise<{
  groups: MealPhotoGroup[];
  unavailable: boolean;
}> {
  try {
    return {
      groups: groupMealPhotos(await listMealPhotos()),
      unavailable: false,
    };
  } catch {
    return { groups: [], unavailable: true };
  }
}

export default async function MealsPage() {
  const { groups, unavailable } = await loadGroups();

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>meal log</p>
          <h1>食事の記録</h1>
          <p>毎日の食事を、撮った日ごとに残しています。</p>
        </header>

        {unavailable ? (
          <p className={styles.message}>現在、写真を読み込めません。</p>
        ) : groups.length === 0 ? (
          <p className={styles.message}>写真はまだありません。</p>
        ) : (
          <div className={styles.days}>
            {groups.map((group) => (
              <section className={styles.day} key={group.date}>
                <h2>
                  <time dateTime={group.date}>{displayDate(group.date)}</time>
                </h2>
                <div className={styles.grid}>
                  {group.photos.map((photo) => (
                    <figure className={styles.photo} key={photo.pathname}>
                      <img
                        src={photo.url}
                        alt={`${displayDate(group.date)}の食事`}
                        loading="lazy"
                        decoding="async"
                      />
                    </figure>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
