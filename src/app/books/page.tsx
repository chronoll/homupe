import { getBooks } from "@/lib/notion";
import BookShelf from "@/components/BookShelf";

export const revalidate = 900;

export default async function BooksPage() {
  const books = await getBooks();
  return <BookShelf books={books} />;
}
