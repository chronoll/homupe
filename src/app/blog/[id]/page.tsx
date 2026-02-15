import { notFound } from 'next/navigation';
import { getBlogPost, getRelatedArticles, extractFirstImageUrl } from '@/lib/notion';
import BlogDetail from '@/components/BlogDetail';
import { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';
import { Metadata } from 'next';

interface BlogDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

/**
 * ブログ詳細ページ（Server Component with ISR）
 * - 静的生成＋15分ごとに自動再検証
 * - 高速な初期表示 + 定期的なコンテンツ更新
 */
export const revalidate = 900; // 15分（900秒）ごとに再検証

/**
 * メタデータ生成（SEO・OGP対応）
 */
export async function generateMetadata({ params }: BlogDetailPageProps): Promise<Metadata> {
  const { id } = await params;

  try {
    const { page, blocks } = await getBlogPost(id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const properties = (page as PageObjectResponse).properties as Record<string, any>;

    const title = properties['名前']?.title?.[0]?.plain_text || 'Untitled';
    const date = properties['公開日']?.date?.start || page.created_time;
    const tags = properties['タグ']?.multi_select?.map((tag: { name: string }) => tag.name) || [];
    const category = properties['選択']?.select?.name || '';

    // ブロックから最初の画像を抽出
    const firstImageUrl = extractFirstImageUrl(blocks);

    // 説明文を生成（最初の段落から抽出、または要約）
    let description = 'ブログ記事';
    for (const block of blocks) {
      if (block.type === 'paragraph' && block.paragraph.rich_text.length > 0) {
        const text = block.paragraph.rich_text.map(rt => rt.plain_text).join('');
        if (text.trim()) {
          description = text.slice(0, 160); // 160文字まで
          break;
        }
      }
    }

    const metadata: Metadata = {
      title: `${title} | ブログ`,
      description,
      openGraph: {
        title,
        description,
        type: 'article',
        publishedTime: date,
        tags: [...tags, category].filter(Boolean),
        url: `/blog/${id}`,
        siteName: '☆ ようこそ！私のホームページへ ☆',
      },
      twitter: {
        card: firstImageUrl ? 'summary_large_image' : 'summary',
        title,
        description,
      },
    };

    // OGP画像が存在する場合のみ追加
    if (firstImageUrl) {
      metadata.openGraph!.images = [
        {
          url: firstImageUrl,
          alt: title,
        },
      ];
      metadata.twitter!.images = [firstImageUrl];
    }

    return metadata;
  } catch (error) {
    console.error('Error generating metadata:', error);
    return {
      title: 'ブログ',
      description: 'ブログ記事',
    };
  }
}

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