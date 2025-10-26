import { getBlogPosts } from '@/lib/notion';
import BlogList from '@/components/BlogList';

/**
 * ブログ一覧ページ（Server Component）
 * Server Componentにより、Notionからのデータ取得がサーバーサイドで実行されます
 * Next.jsの自動キャッシュにより、データは自動的にキャッシュされます
 */
export const dynamic = 'force-dynamic';

export default async function BlogPage() {
  const posts = await getBlogPosts();
  return <BlogList posts={posts} />;
}
