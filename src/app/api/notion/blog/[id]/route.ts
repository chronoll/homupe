import { Client } from '@notionhq/client';
import { NextResponse } from 'next/server';
import { PageObjectResponse, BlockObjectResponse } from '@notionhq/client/build/src/api-endpoints';

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: pageId } = await params;

    // ページの情報を取得
    const page = await notion.pages.retrieve({ page_id: pageId }) as PageObjectResponse;
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const properties = page.properties as Record<string, any>;
    
    // ページのメタデータを抽出
    const titleProperty = properties['名前'];
    const title = titleProperty?.title?.[0]?.plain_text || 'Untitled';
    
    const dateProperty = properties['公開日'];
    const date = dateProperty?.date?.start || 
                properties['作成日時']?.created_time || 
                page.created_time;

    // 公開日時チェック：公開日が未設定または現在日時より先の場合は404エラー
    const currentDate = new Date().toISOString().split('T')[0];
    const publishDate = dateProperty?.date?.start;
    
    if (!publishDate || publishDate > currentDate) {
      return NextResponse.json(
        { error: 'Article not found or not published yet' },
        { status: 404 }
      );
    }
    
    const tagsProperty = properties['タグ'];
    const tags = tagsProperty?.multi_select?.map((tag: { name: string }) => tag.name) || [];
    
    const categoryProperty = properties['選択'];
    const category = categoryProperty?.select?.name || '';

    // 関連記事を取得
    const relatedArticlesProperty = properties['関連記事'];
    const relatedArticleIds = relatedArticlesProperty?.relation?.map((rel: { id: string }) => rel.id) || [];
    
    // 関連記事の詳細情報を取得
    let relatedArticles = [];
    if (relatedArticleIds.length > 0) {
      try {
        const relatedPromises = relatedArticleIds.map(async (relatedId: string) => {
          try {
            const relatedPage = await notion.pages.retrieve({ page_id: relatedId }) as PageObjectResponse;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const relatedProps = relatedPage.properties as Record<string, any>;
            
            // 関連記事の公開日時チェック
            const relatedPublishDate = relatedProps['公開日']?.date?.start;
            if (!relatedPublishDate || relatedPublishDate > currentDate) {
              return null; // 非公開の記事は除外
            }
            
            const relatedTitle = relatedProps['名前']?.title?.[0]?.plain_text || 'Untitled';
            const relatedDate = relatedPublishDate;
            const relatedTags = relatedProps['タグ']?.multi_select?.map((tag: { name: string }) => tag.name) || [];
            const relatedCategory = relatedProps['選択']?.select?.name || '';
            
            return {
              id: relatedPage.id,
              title: relatedTitle,
              date: relatedDate,
              tags: relatedTags,
              category: relatedCategory,
            };
          } catch (error) {
            console.error(`Error fetching related article ${relatedId}:`, error);
            return null; // エラーの記事は除外
          }
        });
        
        const results = await Promise.all(relatedPromises);
        relatedArticles = results.filter(article => article !== null);
      } catch (error) {
        console.error('Error fetching related articles:', error);
      }
    }

    // ページのブロック（コンテンツ）を取得
    const blocks = await getPageBlocks(pageId);

    return NextResponse.json({
      id: page.id,
      title,
      date,
      tags,
      category,
      blocks,
      relatedArticles,
    });
  } catch (error) {
    console.error('Error fetching Notion page:', error);
    return NextResponse.json(
      { error: 'Failed to fetch page from Notion' },
      { status: 500 }
    );
  }
}

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
    
    // 各ブロックについて、子ブロックがある場合は再帰的に取得
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