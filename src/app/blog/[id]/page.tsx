import { notFound } from 'next/navigation';
import { getBlogPost, getRelatedArticles } from '@/lib/notion';
import BlogDetail from '@/components/BlogDetail';
import { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';

interface BlogDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

/**
 * ブログ詳細ページ（Server Component）
 * Server Componentにより、Notionからのデータ取得がサーバーサイドで実行されます
 */
export const dynamic = 'force-dynamic';

export default async function BlogDetailPage({ params }: BlogDetailPageProps) {
  const { id } = await params;

  try {
    const { page, blocks } = await getBlogPost(id);
    const relatedArticles = await getRelatedArticles(id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const properties = (page as PageObjectResponse).properties as Record<string, any>;

    const post = {
      title: properties['名前']?.title?.[0]?.plain_text || 'Untitled',
      date: properties['公開日']?.date?.start || page.created_time,
      tags: properties['タグ']?.multi_select?.map((tag: { name: string }) => tag.name) || [],
      category: properties['選択']?.select?.name || '',
      blocks,
    };

    return <BlogDetail post={post} relatedArticles={relatedArticles} />;
  } catch (error) {
    console.error('Error fetching blog post:', error);
    notFound();
  }
}