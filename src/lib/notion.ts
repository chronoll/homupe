import { Client } from '@notionhq/client';
import { PageObjectResponse, BlockObjectResponse } from '@notionhq/client/build/src/api-endpoints';

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

export interface BlogPost {
  id: string;
  title: string;
  date: string;
  tags: string[];
  category: string;
  url: string;
}

/**
 * ブログ記事一覧を取得（キャッシュ有効）
 * Next.js自動キャッシュにより、fetchリクエストは自動的にキャッシュされます
 */
export async function getBlogPosts(): Promise<BlogPost[]> {
  const databaseId = process.env.NOTION_DATABASE_ID;

  if (!databaseId) {
    console.warn('NOTION_DATABASE_ID not configured, returning empty posts');
    return [];
  }

  const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD形式

  const response = await notion.databases.query({
    database_id: databaseId,
    filter: {
      and: [
        {
          property: '公開日',
          date: {
            is_not_empty: true,
          },
        },
        {
          property: '公開日',
          date: {
            on_or_before: currentDate,
          },
        },
      ],
    },
    sorts: [
      {
        property: '公開日',
        direction: 'descending',
      },
    ],
  });

  const posts = response.results.map((result) => {
    const page = result as PageObjectResponse;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const properties = page.properties as Record<string, any>;

    // 名前プロパティから取得
    const titleProperty = properties['名前'];
    const title = titleProperty?.title?.[0]?.plain_text || 'Untitled';

    // 公開日または作成日時から取得
    const dateProperty = properties['公開日'];
    const date = dateProperty?.date?.start ||
                properties['作成日時']?.created_time ||
                page.created_time;

    // タグプロパティから取得
    const tagsProperty = properties['タグ'];
    const tags = tagsProperty?.multi_select?.map((tag: { name: string }) => tag.name) || [];

    // 選択プロパティからカテゴリーを取得（オプション）
    const categoryProperty = properties['選択'];
    const category = categoryProperty?.select?.name || '';

    // NotionページのURLを使用
    const url = page.url || '';

    return {
      id: page.id,
      title,
      date,
      tags,
      category,
      url,
    };
  });

  return posts;
}

export interface BlogPostDetail {
  page: PageObjectResponse;
  blocks: BlockObjectResponse[];
}

/**
 * 個別のブログ記事を取得（キャッシュ有効）
 * @param id - Notion Page ID
 */
export async function getBlogPost(id: string): Promise<BlogPostDetail> {
  const page = await notion.pages.retrieve({ page_id: id }) as PageObjectResponse;
  const blocksResponse = await notion.blocks.children.list({
    block_id: id,
    page_size: 100,
  });

  return {
    page,
    blocks: blocksResponse.results as BlockObjectResponse[],
  };
}

/**
 * 関連記事を取得（キャッシュ有効）
 * @param pageId - Notion Page ID
 */
export async function getRelatedArticles(pageId: string): Promise<BlogPost[]> {
  try {
    const page = await notion.pages.retrieve({ page_id: pageId }) as PageObjectResponse;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const properties = page.properties as Record<string, any>;

    const relatedProperty = properties['関連記事'];
    if (!relatedProperty?.relation || relatedProperty.relation.length === 0) {
      return [];
    }

    const relatedIds = relatedProperty.relation.map((rel: { id: string }) => rel.id);

    const relatedPages = await Promise.all(
      relatedIds.map(async (id: string) => {
        const relatedPage = await notion.pages.retrieve({ page_id: id }) as PageObjectResponse;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const props = relatedPage.properties as Record<string, any>;

        return {
          id: relatedPage.id,
          title: props['名前']?.title?.[0]?.plain_text || 'Untitled',
          date: props['公開日']?.date?.start || relatedPage.created_time,
          tags: props['タグ']?.multi_select?.map((tag: { name: string }) => tag.name) || [],
          category: props['選択']?.select?.name || '',
          url: relatedPage.url || '',
        };
      })
    );

    return relatedPages;
  } catch (error) {
    console.error('Error fetching related articles:', error);
    return [];
  }
}

/**
 * ブロックから最初の画像URLを抽出
 * @param blocks - Notion blocks
 * @returns 最初に見つかった画像のURL、なければundefined
 */
export function extractFirstImageUrl(blocks: BlockObjectResponse[]): string | undefined {
  for (const block of blocks) {
    if (block.type === 'image') {
      const imageUrl = block.image.type === 'external'
        ? block.image.external.url
        : block.image.type === 'file'
        ? block.image.file.url
        : undefined;

      if (imageUrl) {
        return imageUrl;
      }
    }
  }
  return undefined;
}
