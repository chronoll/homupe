import { Client } from '@notionhq/client';
import { PageObjectResponse, BlockObjectResponse } from '@notionhq/client/build/src/api-endpoints';
import type { Book, BookStatus, BookCategory } from '@/lib/types';

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
 * 本棚データを取得
 */
export async function getBooks(): Promise<Book[]> {
  const databaseId = process.env.NOTION_BOOKS_DATABASE_ID;

  if (!databaseId) {
    console.warn('NOTION_BOOKS_DATABASE_ID not configured, returning empty books');
    return [];
  }

  const response = await notion.databases.query({
    database_id: databaseId,
    sorts: [
      {
        property: '購入日',
        direction: 'descending',
      },
    ],
  });

  const books = response.results.map((result) => {
    const page = result as PageObjectResponse;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const properties = page.properties as Record<string, any>;

    const title = properties['タイトル']?.title?.[0]?.plain_text || 'Untitled';
    const author = properties['著者']?.rich_text?.[0]?.plain_text || '';
    const publisher = properties['出版社']?.rich_text?.[0]?.plain_text || '';
    const status = (properties['ステータス']?.status?.name || '未読') as BookStatus;
    const category = (properties['選択']?.select?.name || '一般') as BookCategory;
    const purchaseDate = properties['購入日']?.date?.start || null;
    const finishDate = properties['読了日']?.date?.start || null;
    const url = properties['URL']?.url || null;

    let coverImageUrl: string | null = null;
    if (page.cover) {
      if (page.cover.type === 'external') {
        coverImageUrl = page.cover.external.url;
      } else if (page.cover.type === 'file') {
        coverImageUrl = page.cover.file.url;
      }
    }

    return {
      id: page.id,
      title,
      author,
      publisher,
      status,
      category,
      purchaseDate,
      finishDate,
      url,
      coverImageUrl,
    };
  });

  return books;
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
