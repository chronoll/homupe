import { Client } from '@notionhq/client';
import { PageObjectResponse, BlockObjectResponse } from '@notionhq/client/build/src/api-endpoints';
import { cache } from 'react';

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

// ブログ記事一覧を取得
export const getBlogPosts = cache(async () => {
  const databaseId = process.env.NOTION_DATABASE_ID;
  if (!databaseId) {
    throw new Error('Database ID not configured');
  }

  const currentDate = new Date().toISOString().split('T')[0];

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

  return response.results.map((result) => {
    const page = result as PageObjectResponse;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const properties = page.properties as Record<string, any>;
    
    const title = properties['名前']?.title?.[0]?.plain_text || 'Untitled';
    const date = properties['公開日']?.date?.start || page.created_time;
    const tags = properties['タグ']?.multi_select?.map((tag: { name: string }) => tag.name) || [];
    const category = properties['選択']?.select?.name || '';

    return {
      id: page.id,
      title,
      date,
      tags,
      category,
    };
  });
});

// ページの全ブロックを再帰的に取得
async function getPageBlocks(blockId: string): Promise<BlockObjectResponse[]> {
  const blocks: BlockObjectResponse[] = [];
  let cursor: string | undefined = undefined;

  do {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response: any = await notion.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    });

    const blockObjects = response.results as BlockObjectResponse[];
    
    for (const block of blockObjects) {
      blocks.push(block);
      if (block.has_children) {
        const children = await getPageBlocks(block.id);
        blocks.push(...children);
      }
    }

    cursor = response.next_cursor;
  } while (cursor);

  return blocks;
}

// 個別のブログ記事を取得
export const getBlogPost = cache(async (pageId: string) => {
  try {
    const page = await notion.pages.retrieve({ page_id: pageId }) as PageObjectResponse;
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const properties = page.properties as Record<string, any>;
    
    const title = properties['名前']?.title?.[0]?.plain_text || 'Untitled';
    const dateProperty = properties['公開日'];
    const date = dateProperty?.date?.start || page.created_time;

    const currentDate = new Date().toISOString().split('T')[0];
    if (!dateProperty?.date?.start || dateProperty.date.start > currentDate) {
      return null;
    }
    
    const tags = properties['タグ']?.multi_select?.map((tag: { name: string }) => tag.name) || [];
    const category = properties['選択']?.select?.name || '';

    const relatedArticleIds = properties['関連記事']?.relation?.map((rel: { id: string }) => rel.id) || [];
    
    let relatedArticles = [];
    if (relatedArticleIds.length > 0) {
      const relatedPromises = relatedArticleIds.map(async (relatedId: string) => {
        try {
          const relatedPage = await notion.pages.retrieve({ page_id: relatedId }) as PageObjectResponse;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const relatedProps = relatedPage.properties as Record<string, any>;
          
          const relatedPublishDate = relatedProps['公開日']?.date?.start;
          if (!relatedPublishDate || relatedPublishDate > currentDate) {
            return null;
          }
          
          return {
            id: relatedPage.id,
            title: relatedProps['名前']?.title?.[0]?.plain_text || 'Untitled',
            date: relatedPublishDate,
            tags: relatedProps['タグ']?.multi_select?.map((tag: { name: string }) => tag.name) || [],
            category: relatedProps['選択']?.select?.name || '',
          };
        } catch {
          return null;
        }
      });
      
      const results = await Promise.all(relatedPromises);
      relatedArticles = results.filter(article => article !== null);
    }

    const blocks = await getPageBlocks(pageId);

    return {
      id: page.id,
      title,
      date,
      tags,
      category,
      blocks,
      relatedArticles,
    };
  } catch (error) {
    console.error('Failed to fetch blog post:', error);
    return null;
  }
});
