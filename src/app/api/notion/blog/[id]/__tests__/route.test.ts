/**
 * @jest-environment node
 */
const mockPagesRetrieve = jest.fn();
const mockBlocksChildrenList = jest.fn();
jest.mock('@notionhq/client', () => ({
  __esModule: true,
  Client: jest.fn(() => ({
    pages: {
      retrieve: mockPagesRetrieve,
    },
    blocks: {
      children: {
        list: mockBlocksChildrenList,
      },
    },
  })),
}));

const { GET } = require('../route');

// Mock environment variables
const originalEnv = process.env;

describe('/api/notion/blog/[id]', () => {
  beforeEach(() => {
    mockPagesRetrieve.mockClear();
    mockBlocksChildrenList.mockClear();
    
    // Reset environment variables
    process.env = {
      ...originalEnv,
      NOTION_API_KEY: 'test-api-key',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return published blog post with content and related articles', async () => {
    const mockPage = {
      id: 'page-1',
      properties: {
        '名前': {
          title: [{ plain_text: 'Test Blog Post' }]
        },
        '公開日': {
          date: { start: '2025-01-01' }
        },
        'タグ': {
          multi_select: [{ name: 'tech' }, { name: 'javascript' }]
        },
        '選択': {
          select: { name: 'Programming' }
        },
        '関連記事': {
          relation: [{ id: 'related-1' }, { id: 'related-2' }]
        },
        '作成日時': {
          created_time: '2025-01-01T00:00:00.000Z'
        }
      },
      created_time: '2025-01-01T00:00:00.000Z'
    };

    const mockBlocks = [
      {
        id: 'block-1',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ plain_text: 'This is a test paragraph' }]
        },
        has_children: false
      }
    ];

    const mockRelatedPage1 = {
      id: 'related-1',
      properties: {
        '名前': {
          title: [{ plain_text: 'Related Article 1' }]
        },
        '公開日': {
          date: { start: '2025-01-01' }
        },
        'タグ': {
          multi_select: [{ name: 'related' }]
        },
        '選択': {
          select: { name: 'Category' }
        }
      }
    };

    const mockRelatedPage2 = {
      id: 'related-2',
      properties: {
        '名前': {
          title: [{ plain_text: 'Related Article 2' }]
        },
        '公開日': {
          date: { start: '2025-01-02' }
        },
        'タグ': {
          multi_select: []
        },
        '選択': {
          select: null
        }
      }
    };

    mockPagesRetrieve
      .mockResolvedValueOnce(mockPage)
      .mockResolvedValueOnce(mockRelatedPage1)
      .mockResolvedValueOnce(mockRelatedPage2);

    mockBlocksChildrenList.mockResolvedValue({
      results: mockBlocks,
      next_cursor: null
    });

    const request = new Request('http://localhost:3000/api/notion/blog/page-1');
    const params = Promise.resolve({ id: 'page-1' });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      id: 'page-1',
      title: 'Test Blog Post',
      date: '2025-01-01',
      tags: ['tech', 'javascript'],
      category: 'Programming',
      blocks: mockBlocks,
      relatedArticles: [
        {
          id: 'related-1',
          title: 'Related Article 1',
          date: '2025-01-01',
          tags: ['related'],
          category: 'Category'
        },
        {
          id: 'related-2',
          title: 'Related Article 2',
          date: '2025-01-02',
          tags: [],
          category: ''
        }
      ]
    });
  });

  it('should return 404 for unpublished post (no publish date)', async () => {
    const mockPage = {
      id: 'page-1',
      properties: {
        '名前': {
          title: [{ plain_text: 'Unpublished Post' }]
        },
        '公開日': {
          date: null // No publish date
        },
        'タグ': {
          multi_select: []
        },
        '選択': {
          select: null
        },
        '関連記事': {
          relation: []
        }
      },
      created_time: '2025-01-01T00:00:00.000Z'
    };

    mockPagesRetrieve.mockResolvedValue(mockPage);

    const request = new Request('http://localhost:3000/api/notion/blog/page-1');
    const params = Promise.resolve({ id: 'page-1' });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Article not found or not published yet');
  });

  it('should return 404 for future-dated post', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 1);
    const futureDateString = futureDate.toISOString().split('T')[0];

    const mockPage = {
      id: 'page-1',
      properties: {
        '名前': {
          title: [{ plain_text: 'Future Post' }]
        },
        '公開日': {
          date: { start: futureDateString }
        },
        'タグ': {
          multi_select: []
        },
        '選択': {
          select: null
        },
        '関連記事': {
          relation: []
        }
      },
      created_time: '2025-01-01T00:00:00.000Z'
    };

    mockPagesRetrieve.mockResolvedValue(mockPage);

    const request = new Request('http://localhost:3000/api/notion/blog/page-1');
    const params = Promise.resolve({ id: 'page-1' });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Article not found or not published yet');
  });

  it('should exclude unpublished related articles', async () => {
    const mockPage = {
      id: 'page-1',
      properties: {
        '名前': {
          title: [{ plain_text: 'Test Post' }]
        },
        '公開日': {
          date: { start: '2025-01-01' }
        },
        'タグ': {
          multi_select: []
        },
        '選択': {
          select: null
        },
        '関連記事': {
          relation: [{ id: 'related-1' }, { id: 'related-2' }]
        }
      },
      created_time: '2025-01-01T00:00:00.000Z'
    };

    const mockPublishedRelated = {
      id: 'related-1',
      properties: {
        '名前': {
          title: [{ plain_text: 'Published Related' }]
        },
        '公開日': {
          date: { start: '2025-01-01' }
        },
        'タグ': {
          multi_select: []
        },
        '選択': {
          select: null
        }
      }
    };

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 1);
    const futureDateString = futureDate.toISOString().split('T')[0];

    const mockUnpublishedRelated = {
      id: 'related-2',
      properties: {
        '名前': {
          title: [{ plain_text: 'Unpublished Related' }]
        },
        '公開日': {
          date: { start: futureDateString }
        },
        'タグ': {
          multi_select: []
        },
        '選択': {
          select: null
        }
      }
    };

    mockPagesRetrieve
      .mockResolvedValueOnce(mockPage)
      .mockResolvedValueOnce(mockPublishedRelated)
      .mockResolvedValueOnce(mockUnpublishedRelated);

    mockBlocksChildrenList.mockResolvedValue({
      results: [],
      next_cursor: null
    });

    const request = new Request('http://localhost:3000/api/notion/blog/page-1');
    const params = Promise.resolve({ id: 'page-1' });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.relatedArticles).toHaveLength(1);
    expect(data.relatedArticles[0].title).toBe('Published Related');
  });

  it('should handle blocks with children recursively', async () => {
    const mockPage = {
      id: 'page-1',
      properties: {
        '名前': {
          title: [{ plain_text: 'Test Post' }]
        },
        '公開日': {
          date: { start: '2025-01-01' }
        },
        'タグ': {
          multi_select: []
        },
        '選択': {
          select: null
        },
        '関連記事': {
          relation: []
        }
      },
      created_time: '2025-01-01T00:00:00.000Z'
    };

    const mockParentBlock = {
      id: 'parent-block',
      type: 'toggle',
      toggle: {
        rich_text: [{ plain_text: 'Toggle block' }]
      },
      has_children: true
    };

    const mockChildBlock = {
      id: 'child-block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{ plain_text: 'Child paragraph' }]
      },
      has_children: false
    };

    mockPagesRetrieve.mockResolvedValue(mockPage);
    
    // First call returns parent blocks, second call returns child blocks
    mockBlocksChildrenList
      .mockResolvedValueOnce({
        results: [mockParentBlock],
        next_cursor: null
      })
      .mockResolvedValueOnce({
        results: [mockChildBlock],
        next_cursor: null
      });

    const request = new Request('http://localhost:3000/api/notion/blog/page-1');
    const params = Promise.resolve({ id: 'page-1' });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.blocks).toHaveLength(2);
    expect(data.blocks[0]).toEqual(mockParentBlock);
    expect(data.blocks[1]).toEqual(mockChildBlock);
    
    // Verify that blocks.children.list was called twice
    expect(mockBlocksChildrenList).toHaveBeenCalledTimes(2);
  });

  it('should handle errors when fetching related articles gracefully', async () => {
    const mockPage = {
      id: 'page-1',
      properties: {
        '名前': {
          title: [{ plain_text: 'Test Post' }]
        },
        '公開日': {
          date: { start: '2025-01-01' }
        },
        'タグ': {
          multi_select: []
        },
        '選択': {
          select: null
        },
        '関連記事': {
          relation: [{ id: 'related-1' }]
        }
      },
      created_time: '2025-01-01T00:00:00.000Z'
    };

    mockPagesRetrieve
      .mockResolvedValueOnce(mockPage)
      .mockRejectedValueOnce(new Error('Page not found'));

    mockBlocksChildrenList.mockResolvedValue({
      results: [],
      next_cursor: null
    });

    const request = new Request('http://localhost:3000/api/notion/blog/page-1');
    const params = Promise.resolve({ id: 'page-1' });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.relatedArticles).toEqual([]);
  });

  it('should return 500 error when Notion API fails', async () => {
    mockPagesRetrieve.mockRejectedValue(new Error('Notion API Error'));

    const request = new Request('http://localhost:3000/api/notion/blog/page-1');
    const params = Promise.resolve({ id: 'page-1' });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch page from Notion');
  });

  it('should handle blocks with pagination', async () => {
    const mockPage = {
      id: 'page-1',
      properties: {
        '名前': {
          title: [{ plain_text: 'Test Post' }]
        },
        '公開日': {
          date: { start: '2025-01-01' }
        },
        'タグ': {
          multi_select: []
        },
        '選択': {
          select: null
        },
        '関連記事': {
          relation: []
        }
      },
      created_time: '2025-01-01T00:00:00.000Z'
    };

    const mockBlock1 = {
      id: 'block-1',
      type: 'paragraph',
      paragraph: {
        rich_text: [{ plain_text: 'First paragraph' }]
      },
      has_children: false
    };

    const mockBlock2 = {
      id: 'block-2',
      type: 'paragraph',
      paragraph: {
        rich_text: [{ plain_text: 'Second paragraph' }]
      },
      has_children: false
    };

    mockPagesRetrieve.mockResolvedValue(mockPage);
    
    // Simulate pagination
    mockBlocksChildrenList
      .mockResolvedValueOnce({
        results: [mockBlock1],
        next_cursor: 'cursor-1'
      })
      .mockResolvedValueOnce({
        results: [mockBlock2],
        next_cursor: null
      });

    const request = new Request('http://localhost:3000/api/notion/blog/page-1');
    const params = Promise.resolve({ id: 'page-1' });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.blocks).toHaveLength(2);
    expect(data.blocks[0]).toEqual(mockBlock1);
    expect(data.blocks[1]).toEqual(mockBlock2);
    
    // Verify pagination was handled correctly
    expect(mockBlocksChildrenList).toHaveBeenCalledWith({
      block_id: 'page-1',
      start_cursor: undefined,
      page_size: 100,
    });
    expect(mockBlocksChildrenList).toHaveBeenCalledWith({
      block_id: 'page-1',
      start_cursor: 'cursor-1',
      page_size: 100,
    });
  });
});