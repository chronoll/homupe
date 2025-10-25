import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BlogPage from '../page';

// Mock next/navigation
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock Mantine components
jest.mock('@mantine/core', () => ({
  Container: ({ children, ...props }: any) => <div data-testid="mantine-container" {...props}>{children}</div>,
  Title: ({ children, order, ...props }: any) => <div data-testid={`mantine-title-${order}`} {...props}>{children}</div>,
  Card: ({ children, onClick, onMouseEnter, onMouseLeave, style, ...props }: any) => (
    <div 
      data-testid="mantine-card" 
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={style}
      {...props}
    >
      {children}
    </div>
  ),
  Text: ({ children, size, c, ...props }: any) => (
    <span data-testid={`mantine-text-${size || 'default'}`} data-color={c} {...props}>{children}</span>
  ),
  Badge: ({ children, variant, size, color, ...props }: any) => (
    <span data-testid={`mantine-badge-${variant}-${size}`} data-color={color} {...props}>{children}</span>
  ),
  Group: ({ children, justify, ...props }: any) => (
    <div data-testid="mantine-group" data-justify={justify} {...props}>{children}</div>
  ),
  Stack: ({ children, gap, ...props }: any) => (
    <div data-testid="mantine-stack" data-gap={gap} {...props}>{children}</div>
  ),
  Loader: (props: any) => <div data-testid="mantine-loader" {...props}>Loading...</div>,
  Alert: ({ children, icon, title, color, ...props }: any) => (
    <div data-testid="mantine-alert" data-color={color} {...props}>
      {icon && <span data-testid="alert-icon">{icon}</span>}
      {title && <div data-testid="alert-title">{title}</div>}
      {children}
    </div>
  ),
}));

// Mock Tabler icons
jest.mock('@tabler/icons-react', () => ({
  IconCalendar: (props: any) => <span data-testid="icon-calendar" {...props}>📅</span>,
  IconAlertCircle: (props: any) => <span data-testid="icon-alert-circle" {...props}>⚠️</span>,
}));

// Mock BlogBackground component
jest.mock('@/components/BlogBackground', () => {
  return function MockBlogBackground({ children }: { children: React.ReactNode }) {
    return <div data-testid="blog-background">{children}</div>;
  };
});

const mockBlogPosts = [
  {
    id: 'post-1',
    title: 'First Blog Post',
    date: '2025-01-01',
    tags: ['react', 'typescript'],
    category: 'Programming',
  },
  {
    id: 'post-2',
    title: 'Second Blog Post',
    date: '2025-01-02',
    tags: ['design', 'ui'],
    category: 'UI/UX',
  },
  {
    id: 'post-3',
    title: 'Third Blog Post',
    date: '2025-01-03',
    tags: ['blog'],
    category: '',
  },
];

describe('BlogPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockClear();
  });

  it('renders loading state initially', async () => {
    mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

    render(<BlogPage />);

    expect(screen.getByTestId('blog-background')).toBeInTheDocument();
    expect(screen.getByTestId('mantine-loader')).toBeInTheDocument();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders blog posts after successful fetch', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockBlogPosts),
    });

    render(<BlogPage />);

    await waitFor(() => {
      expect(screen.getByText('Blog')).toBeInTheDocument();
      expect(screen.getByText('First Blog Post')).toBeInTheDocument();
      expect(screen.getByText('Second Blog Post')).toBeInTheDocument();
      expect(screen.getByText('Third Blog Post')).toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/notion/blog');
  });

  it('renders error state when fetch fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    render(<BlogPage />);

    await waitFor(() => {
      expect(screen.getByTestId('mantine-alert')).toBeInTheDocument();
      expect(screen.getByTestId('alert-title')).toHaveTextContent('エラー');
      expect(screen.getByText('Failed to fetch blog posts')).toBeInTheDocument();
    });
  });

  it('renders error state when network request fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    render(<BlogPage />);

    await waitFor(() => {
      expect(screen.getByTestId('mantine-alert')).toBeInTheDocument();
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('displays blog post cards with correct information', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockBlogPosts),
    });

    render(<BlogPage />);

    await waitFor(() => {
      expect(screen.getByText('First Blog Post')).toBeInTheDocument();
    });

    // Check categories
    expect(screen.getByText('Programming')).toBeInTheDocument();
    expect(screen.getByText('UI/UX')).toBeInTheDocument();

    // Check tags
    expect(screen.getByText('react')).toBeInTheDocument();
    expect(screen.getByText('typescript')).toBeInTheDocument();
    expect(screen.getByText('design')).toBeInTheDocument();
    expect(screen.getByText('ui')).toBeInTheDocument();
    expect(screen.getByText('blog')).toBeInTheDocument();

    // Check dates (formatted in Japanese)
    expect(screen.getByText('2025年1月1日')).toBeInTheDocument();
    expect(screen.getByText('2025年1月2日')).toBeInTheDocument();
    expect(screen.getByText('2025年1月3日')).toBeInTheDocument();

    // Check calendar icons
    const calendarIcons = screen.getAllByTestId('icon-calendar');
    expect(calendarIcons).toHaveLength(3);
  });

  it('navigates to blog post when card is clicked', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockBlogPosts),
    });

    render(<BlogPage />);

    await waitFor(() => {
      expect(screen.getByText('First Blog Post')).toBeInTheDocument();
    });

    const firstCard = screen.getAllByTestId('mantine-card')[0];
    fireEvent.click(firstCard);

    expect(mockPush).toHaveBeenCalledWith('/blog/post-1');
  });

  it('handles mouse hover effects on cards', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockBlogPosts),
    });

    render(<BlogPage />);

    await waitFor(() => {
      expect(screen.getByText('First Blog Post')).toBeInTheDocument();
    });

    const firstCard = screen.getAllByTestId('mantine-card')[0];
    
    // Test mouse enter
    fireEvent.mouseEnter(firstCard);
    expect(firstCard.style.transform).toBe('translateY(-4px)');
    expect(firstCard.style.boxShadow).toBe('0 20px 40px rgba(0, 0, 0, 0.2)');

    // Test mouse leave
    fireEvent.mouseLeave(firstCard);
    expect(firstCard.style.transform).toBe('translateY(0)');
    expect(firstCard.style.boxShadow).toBe('0 10px 25px rgba(0, 0, 0, 0.1)');
  });

  it('displays message when no blog posts are available', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    render(<BlogPage />);

    await waitFor(() => {
      expect(screen.getByText('Blog')).toBeInTheDocument();
      expect(screen.getByText('ブログ記事がありません。')).toBeInTheDocument();
    });
  });

  it('renders BlogBackground component', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockBlogPosts),
    });

    render(<BlogPage />);

    expect(screen.getByTestId('blog-background')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByText('Blog')).toBeInTheDocument();
    });
  });

  it('applies correct styling to blog post cards', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockBlogPosts),
    });

    render(<BlogPage />);

    await waitFor(() => {
      expect(screen.getByText('First Blog Post')).toBeInTheDocument();
    });

    const cards = screen.getAllByTestId('mantine-card');
    expect(cards).toHaveLength(3);

    cards.forEach(card => {
      expect(card).toHaveStyle({
        cursor: 'pointer',
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        transition: 'all 0.3s ease',
      });
    });
  });

  it('handles posts without category correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockBlogPosts),
    });

    render(<BlogPage />);

    await waitFor(() => {
      expect(screen.getByText('Third Blog Post')).toBeInTheDocument();
    });

    // The third post has no category, so should not show a category badge
    const categoryBadges = screen.getAllByTestId('mantine-badge-filled-sm');
    expect(categoryBadges).toHaveLength(2); // Only first two posts have categories
  });

  it('handles posts without tags correctly', async () => {
    const postsWithoutTags = [
      {
        id: 'post-no-tags',
        title: 'Post Without Tags',
        date: '2025-01-01',
        tags: [],
        category: 'Test',
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(postsWithoutTags),
    });

    render(<BlogPage />);

    await waitFor(() => {
      expect(screen.getByText('Post Without Tags')).toBeInTheDocument();
      expect(screen.getByText('Test')).toBeInTheDocument();
    });

    // Should not show any tag badges
    expect(screen.queryAllByTestId('mantine-badge-light-sm')).toHaveLength(0);
  });

  it('formats dates correctly in Japanese locale', async () => {
    const testPosts = [
      {
        id: 'post-date-test',
        title: 'Date Test Post',
        date: '2025-12-25',
        tags: [],
        category: '',
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(testPosts),
    });

    render(<BlogPage />);

    await waitFor(() => {
      expect(screen.getByText('Date Test Post')).toBeInTheDocument();
      expect(screen.getByText('2025年12月25日')).toBeInTheDocument();
    });
  });

  it('handles multiple navigation clicks correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockBlogPosts),
    });

    render(<BlogPage />);

    await waitFor(() => {
      expect(screen.getByText('First Blog Post')).toBeInTheDocument();
    });

    const cards = screen.getAllByTestId('mantine-card');
    
    fireEvent.click(cards[0]);
    expect(mockPush).toHaveBeenCalledWith('/blog/post-1');

    fireEvent.click(cards[1]);
    expect(mockPush).toHaveBeenCalledWith('/blog/post-2');

    fireEvent.click(cards[2]);
    expect(mockPush).toHaveBeenCalledWith('/blog/post-3');

    expect(mockPush).toHaveBeenCalledTimes(3);
  });

  it('displays title with correct styling', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockBlogPosts),
    });

    render(<BlogPage />);

    await waitFor(() => {
      const title = screen.getByTestId('mantine-title-1');
      expect(title).toHaveTextContent('Blog');
    });
  });

  it('organizes content with proper layout components', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockBlogPosts),
    });

    render(<BlogPage />);

    await waitFor(() => {
      expect(screen.getByTestId('mantine-container')).toBeInTheDocument();
      expect(screen.getByTestId('mantine-stack')).toBeInTheDocument();
      expect(screen.getAllByTestId('mantine-group')).toHaveLength(6); // 2 groups per post × 3 posts
    });

    const stack = screen.getByTestId('mantine-stack');
    expect(stack).toHaveAttribute('data-gap', 'md');
  });
});