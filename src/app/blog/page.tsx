import { getBlogPosts } from '@/lib/notion';
import BlogList from '@/components/BlogList';

/**
 * ブログ一覧ページ（Server Component with ISR）
 * - 静的生成＋15分ごとに自動再検証
 * - 高速な初期表示 + 定期的なコンテンツ更新
 */
export const revalidate = 900; // 15分（900秒）ごとに再検証

export default async function BlogPage() {
  const posts = await getBlogPosts();
  return <BlogList posts={posts} />;
}
