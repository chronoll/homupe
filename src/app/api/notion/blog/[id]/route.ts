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
    
    const tagsProperty = properties['タグ'];
    const tags = tagsProperty?.multi_select?.map((tag: { name: string }) => tag.name) || [];
    
    const categoryProperty = properties['選択'];
    const category = categoryProperty?.select?.name || '';

    // ページのブロック（コンテンツ）を取得
    const blocks = await getPageBlocks(pageId);

    return NextResponse.json({
      id: page.id,
      title,
      date,
      tags,
      category,
      blocks,
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