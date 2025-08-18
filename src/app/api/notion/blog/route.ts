import { Client } from '@notionhq/client';
import { NextResponse } from 'next/server';
import { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

export async function GET() {
  try {
    const databaseId = process.env.NOTION_DATABASE_ID;
    
    if (!databaseId) {
      return NextResponse.json(
        { error: 'Database ID not configured' },
        { status: 500 }
      );
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

    return NextResponse.json(posts);
  } catch (error) {
    console.error('Error fetching Notion data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch data from Notion' },
      { status: 500 }
    );
  }
}