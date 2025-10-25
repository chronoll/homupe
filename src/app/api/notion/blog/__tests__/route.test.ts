/**
 * @jest-environment node
 */
import { GET } from '../route';
import { Client } from '@notionhq/client';

// Mock the Notion client
jest.mock('@notionhq/client');
const mockNotion = Client as jest.MockedClass<typeof Client>;

// Mock environment variables
const originalEnv = process.env;

describe('/api/notion/blog', () => {
  let mockQuery: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset environment variables
    process.env = {
      ...originalEnv,
      NOTION_API_KEY: 'test-api-key',
      NOTION_DATABASE_ID: 'test-database-id',
    };

    // Mock the notion query method
    mockQuery = jest.fn();
    (mockNotion as any).mockImplementation(() => ({
      databases: {
        query: mockQuery,
      },
    }));
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return blog posts filtered by current date', async () => {
    const mockResponse = {
      results: [
        {
          id: 'page-1',
          properties: {
            '名前': {
              title: [{ plain_text: 'Test Blog Post 1' }]
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
            '作成日時': {
              created_time: '2025-01-01T00:00:00.000Z'
            }
          },
          created_time: '2025-01-01T00:00:00.000Z',
          url: 'https://notion.so/page-1'
        },
        {
          id: 'page-2',
          properties: {
            '名前': {
              title: [{ plain_text: 'Test Blog Post 2' }]
            },
            '公開日': {
              date: { start: '2025-01-02' }
            },
            'タグ': {
              multi_select: [{ name: 'design' }]
            },
            '選択': {
              select: { name: 'UI/UX' }
            },
            '作成日時': {
              created_time: '2025-01-02T00:00:00.000Z'
            }
          },
          created_time: '2025-01-02T00:00:00.000Z',
          url: 'https://notion.so/page-2'
        }
      ]
    };

    mockQuery.mockResolvedValue(mockResponse);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(2);
    expect(data[0]).toEqual({
      id: 'page-1',
      title: 'Test Blog Post 1',
      date: '2025-01-01',
      tags: ['tech', 'javascript'],
      category: 'Programming',
      url: 'https://notion.so/page-1'
    });
    expect(data[1]).toEqual({
      id: 'page-2',
      title: 'Test Blog Post 2',
      date: '2025-01-02',
      tags: ['design'],
      category: 'UI/UX',
      url: 'https://notion.so/page-2'
    });
  });

  it('should filter by current date and exclude future posts', async () => {
    const currentDate = new Date().toISOString().split('T')[0];
    
    const response = await GET();
    
    // Verify that the query was called with correct date filter
    expect(mockQuery).toHaveBeenCalledWith({
      database_id: 'test-database-id',
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
  });

  it('should handle posts with missing properties gracefully', async () => {
    const mockResponse = {
      results: [
        {
          id: 'page-3',
          properties: {
            '名前': {
              title: [] // Empty title
            },
            '公開日': {
              date: { start: '2025-01-01' }
            },
            'タグ': {
              multi_select: [] // No tags
            },
            '選択': {
              select: null // No category
            }
          },
          created_time: '2025-01-01T00:00:00.000Z',
          url: 'https://notion.so/page-3'
        }
      ]
    };

    mockQuery.mockResolvedValue(mockResponse);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data[0]).toEqual({
      id: 'page-3',
      title: 'Untitled',
      date: '2025-01-01',
      tags: [],
      category: '',
      url: 'https://notion.so/page-3'
    });
  });

  it('should use created_time when publish date is not available', async () => {
    const mockResponse = {
      results: [
        {
          id: 'page-4',
          properties: {
            '名前': {
              title: [{ plain_text: 'Test Post' }]
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
            '作成日時': {
              created_time: '2025-01-01T00:00:00.000Z'
            }
          },
          created_time: '2025-01-01T00:00:00.000Z',
          url: 'https://notion.so/page-4'
        }
      ]
    };

    mockQuery.mockResolvedValue(mockResponse);

    const response = await GET();
    const data = await response.json();

    expect(data[0].date).toBe('2025-01-01T00:00:00.000Z');
  });

  it('should return 500 error when database ID is not configured', async () => {
    delete process.env.NOTION_DATABASE_ID;

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Database ID not configured');
  });

  it('should return 500 error when Notion API fails', async () => {
    mockQuery.mockRejectedValue(new Error('Notion API Error'));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch data from Notion');
  });

  it('should sort posts by publish date in descending order', async () => {
    const response = await GET();
    
    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        sorts: [
          {
            property: '公開日',
            direction: 'descending',
          },
        ],
      })
    );
  });
});