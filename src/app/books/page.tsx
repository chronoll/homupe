import type { Metadata } from "next";
import { getBooks } from "@/lib/notion";
import BookShelf from "@/components/BookShelf";

const title = "本棚";
const description = "一般書と技術書の読書記録";
const image = {
  url: "https://www.chronoll.com/images/books-og.png",
  width: 1200,
  height: 630,
  alt: "本棚ページのスクリーンショット。読書中・未読の本が2段に並んでいる",
};

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    url: "https://www.chronoll.com/books",
    type: "website",
    locale: "ja_JP",
    images: [image],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [image],
  },
};

export const revalidate = 900;

export default async function BooksPage() {
  const books = await getBooks();
  return <BookShelf books={books} />;
}
