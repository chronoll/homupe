import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BlogDetailPage from '../page';

// Mock next/navigation
const mockNotFound = jest.fn();
jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'test-post-id' }),
  notFound: () => mockNotFound(),
}));

// Mock Link component
jest.mock('next/link', () => {
  return function MockLink({ children, href, ...props }: any) {
    return <a href={href} data-testid="next-link" {...props}>{children}</a>;
  };
});

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock Mantine components
jest.mock('@mantine/core', () => ({
  Container: ({ children, ...props }: any) => <div data-testid="mantine-container" {...props}>{children}</div>,
  Title: ({ children, order, ...props }: any) => <div data-testid={`mantine-title-${order}`} {...props}>{children}</div>,
  Group: ({ children, justify, align, ...props }: any) => (
    <div data-testid="mantine-group" data-justify={justify} data-align={align} {...props}>{children}</div>
  ),
  Badge: ({ children, variant, size, color, ...props }: any) => (
    <span data-testid={`mantine-badge-${variant}-${size}`} data-color={color} {...props}>{children}</span>
  ),
  Text: ({ children, size, c, ...props }: any) => (
    <span data-testid={`mantine-text-${size || 'default'}`} data-color={c} {...props}>{children}</span>
  ),
  Loader: (props: any) => <div data-testid="mantine-loader" {...props}>Loading...</div>,
  Alert: ({ children, icon, title, color, ...props }: any) => (
    <div data-testid="mantine-alert" data-color={color} {...props}>
      {icon && <span data-testid="alert-icon">{icon}</span>}
      {title && <div data-testid="alert-title">{title}</div>}
      {children}
    </div>
  ),
  Button: ({ children, leftSection, component, href, ...props }: any) => {
    const Element = component === 'a' ? 'a' : 'button';
    return (
      <Element data-testid="mantine-button" href={href} {...props}>
        {leftSection && <span data-testid="button-left-section">{leftSection}</span>}
        {children}
      </Element>
    );
  },
  Box: ({ children, style, ...props }: any) => (
    <div data-testid="mantine-box" style={style} {...props}>{children}</div>
  ),
}));

// Mock Tabler icons
jest.mock('@tabler/icons-react', () => ({
  IconArrowLeft: (props: any) => <span data-testid="icon-arrow-left" {...props}>←</span>,
  IconCalendar: (props: any) => <span data-testid="icon-calendar" {...props}>📅</span>,
  IconAlertCircle: (props: any) => <span data-testid="icon-alert-circle" {...props}>⚠️</span>,
}));

// Mock components
jest.mock('@/components/NotionBlockRenderer', () => {
  return function MockNotionBlockRenderer({ blocks }: { blocks: any[] }) {
    return (
      <div data-testid="notion-block-renderer">
        {blocks.map((block, i) => (
          <div key={i} data-testid={`notion-block-${block.type}`}>
            {block.type}: {block.content || 'Block content'}
          </div>
        ))}
      </div>
    );
  };
});

jest.mock('@/components/BlogBackground', () => {
  return function MockBlogBackground({ children }: { children: React.ReactNode }) {
    return <div data-testid="blog-background">{children}</div>;
  };
});

jest.mock('@/components/RelatedArticles', () => {
  return function MockRelatedArticles({ articles }: { articles: any[] }) {
    return (
      <div data-testid="related-articles">
        Related Articles: {articles.length} articles
        {articles.map(article => (
          <div key={article.id} data-testid="related-article">
            {article.title}
          </div>
        ))}
      </div>
    );
  };
});

const mockBlogPost = {
  id: 'test-post-id',
  title: 'Test Blog Post',
  date: '2025-01-01',
  tags: ['react', 'typescript', 'testing'],
  category: 'Programming',
  blocks: [
    { id: 'block-1', type: 'paragraph', content: 'First paragraph' },
    { id: 'block-2', type: 'heading_1', content: 'Main heading' },
    { id: 'block-3', type: 'code', content: 'console.log("Hello");' },
  ],
  relatedArticles: [
    {
      id: 'related-1',
      title: 'Related Article 1',
      date: '2025-01-02',
      tags: ['react'],
      category: 'Programming',
    },
    {
      id: 'related-2',
      title: 'Related Article 2',
      date: '2025-01-03',
      tags: ['typescript'],
      category: 'Programming',
    },
  ],
};

describe('BlogDetailPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockClear();
    mockNotFound.mockClear();
  });

  it('renders loading state initially', async () => {
    mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

    render(<BlogDetailPage />);

    expect(screen.getByTestId('blog-background')).toBeInTheDocument();
    expect(screen.getByTestId('mantine-loader')).toBeInTheDocument();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders blog post after successful fetch', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockBlogPost),
    });

    render(<BlogDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Blog Post')).toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/notion/blog/test-post-id');
    
    // Check post metadata
    expect(screen.getByText('Programming')).toBeInTheDocument();
    expect(screen.getByText('react')).toBeInTheDocument();
    expect(screen.getByText('typescript')).toBeInTheDocument();
    expect(screen.getByText('testing')).toBeInTheDocument();
    expect(screen.getByText('2025年1月1日')).toBeInTheDocument();
  });

  it('calls notFound when post returns 404', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    render(<BlogDetailPage />);

    await waitFor(() => {
      expect(mockNotFound).toHaveBeenCalled();
    });
  });

  it('renders error state when fetch fails with non-404 error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    render(<BlogDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId('mantine-alert')).toBeInTheDocument();
      expect(screen.getByTestId('alert-title')).toHaveTextContent('エラー');
      expect(screen.getByText('Failed to fetch blog post')).toBeInTheDocument();
    });

    expect(mockNotFound).not.toHaveBeenCalled();
  });

  it('renders error state when network request fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    render(<BlogDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId('mantine-alert')).toBeInTheDocument();
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('handles 404 error in catch block', async () => {
    const error = new Error('404: Not found');
    mockFetch.mockRejectedValueOnce(error);

    render(<BlogDetailPage />);

    await waitFor(() => {
      expect(mockNotFound).toHaveBeenCalled();
    });
  });

  it('renders back button with correct link', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockBlogPost),
    });

    render(<BlogDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Blog Post')).toBeInTheDocument();
    });

    const backButton = screen.getByTestId('mantine-button');
    expect(backButton).toHaveTextContent('ブログ一覧に戻る');
    expect(backButton).toHaveAttribute('href', '/blog');
    expect(screen.getByTestId('icon-arrow-left')).toBeInTheDocument();
  });

  it('renders NotionBlockRenderer with correct blocks', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockBlogPost),
    });

    render(<BlogDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId('notion-block-renderer')).toBeInTheDocument();
    });

    expect(screen.getByTestId('notion-block-paragraph')).toBeInTheDocument();
    expect(screen.getByTestId('notion-block-heading_1')).toBeInTheDocument();
    expect(screen.getByTestId('notion-block-code')).toBeInTheDocument();
  });

  it('renders related articles when available', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockBlogPost),
    });

    render(<BlogDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId('related-articles')).toBeInTheDocument();
    });

    expect(screen.getByText('Related Articles: 2 articles')).toBeInTheDocument();
    expect(screen.getByText('Related Article 1')).toBeInTheDocument();
    expect(screen.getByText('Related Article 2')).toBeInTheDocument();
  });

  it('does not render related articles section when no related articles', async () => {
    const postWithoutRelated = {
      ...mockBlogPost,
      relatedArticles: [],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(postWithoutRelated),
    });

    render(<BlogDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Blog Post')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('related-articles')).not.toBeInTheDocument();
  });

  it('handles post without category correctly', async () => {
    const postWithoutCategory = {
      ...mockBlogPost,
      category: '',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(postWithoutCategory),
    });

    render(<BlogDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Blog Post')).toBeInTheDocument();
    });

    // Should not show category badge
    expect(screen.queryAllByTestId('mantine-badge-filled-md')).toHaveLength(0);
  });

  it('handles post without tags correctly', async () => {
    const postWithoutTags = {
      ...mockBlogPost,
      tags: [],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(postWithoutTags),
    });

    render(<BlogDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Blog Post')).toBeInTheDocument();
    });

    // Should not show tag badges
    expect(screen.queryAllByTestId('mantine-badge-light-md')).toHaveLength(0);
  });

  it('formats date correctly in Japanese locale', async () => {
    const postWithSpecificDate = {
      ...mockBlogPost,
      date: '2025-12-25',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(postWithSpecificDate),
    });

    render(<BlogDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('2025年12月25日')).toBeInTheDocument();
    });
  });

  it('renders calendar icon with date', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockBlogPost),
    });

    render(<BlogDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId('icon-calendar')).toBeInTheDocument();
    });
  });

  it('applies correct styling to content boxes', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockBlogPost),
    });

    render(<BlogDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Blog Post')).toBeInTheDocument();
    });

    const boxes = screen.getAllByTestId('mantine-box');
    
    // Check for proper styling
    boxes.forEach(box => {
      const style = box.style;
      if (style.background) {
        expect(style.background).toContain('rgba(255, 255, 255, 0.95)');
        expect(style.backdropFilter).toBe('blur(10px)');
        expect(style.border).toBe('1px solid rgba(255, 255, 255, 0.2)');
        expect(style.borderRadius).toBe('12px');
        expect(style.padding).toBe('2rem');
      }
    });
  });

  it('renders with BlogBackground wrapper', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockBlogPost),
    });

    render(<BlogDetailPage />);

    expect(screen.getByTestId('blog-background')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByText('Test Blog Post')).toBeInTheDocument();
    });
  });

  it('displays error with back button when post not found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    render(<BlogDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId('mantine-alert')).toBeInTheDocument();
      expect(screen.getByTestId('mantine-button')).toBeInTheDocument();
      expect(screen.getByText('ブログ一覧に戻る')).toBeInTheDocument();
    });
  });

  it('organizes content with proper layout structure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockBlogPost),
    });

    render(<BlogDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId('mantine-container')).toBeInTheDocument();
      expect(screen.getAllByTestId('mantine-group')).toHaveLength(2); // One for badges, one for date
    });
  });

  it('handles null post state correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(null),
    });

    render(<BlogDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId('mantine-alert')).toBeInTheDocument();
      expect(screen.getByText('ブログ記事が見つかりません')).toBeInTheDocument();
    });
  });

  it('handles missing relatedArticles property gracefully', async () => {
    const postWithoutRelatedProperty = {
      ...mockBlogPost,
    };
    delete (postWithoutRelatedProperty as any).relatedArticles;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(postWithoutRelatedProperty),
    });

    render(<BlogDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Blog Post')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('related-articles')).not.toBeInTheDocument();
  });
});