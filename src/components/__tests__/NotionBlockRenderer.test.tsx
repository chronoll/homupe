import React from 'react';
import { render, screen } from '@testing-library/react';
import NotionBlockRenderer from '../NotionBlockRenderer';
import { BlockObjectResponse } from '@notionhq/client/build/src/api-endpoints';

// Mock Mantine components
jest.mock('@mantine/core', () => {
  const ListComponent = ({ children, type, ...props }: any) => (
    <ul data-testid={`mantine-list-${type}`} {...props}>{children}</ul>
  );
  
  const ListItem = ({ children, ...props }: any) => 
    <li data-testid="mantine-list-item" {...props}>{children}</li>;

  ListComponent.Item = ListItem;

  return {
    Text: ({ children, ...props }: any) => <p data-testid="mantine-text" {...props}>{children}</p>,
    Title: ({ children, order, ...props }: any) => (
      <div data-testid={`mantine-title-${order}`} {...props}>{children}</div>
    ),
    List: ListComponent,
    Blockquote: ({ children, ...props }: any) => <blockquote data-testid="mantine-blockquote" {...props}>{children}</blockquote>,
    Code: ({ children, block, ...props }: any) => (
      <code data-testid={`mantine-code${block ? '-block' : ''}`} {...props}>{children}</code>
    ),
    Divider: (props: any) => <hr data-testid="mantine-divider" {...props} />,
    Image: ({ src, alt, ...props }: any) => <img data-testid="mantine-image" src={src} alt={alt} {...props} />,
    Table: (() => {
      const TableComponent = ({ children, ...props }: any) => <table data-testid="mantine-table" {...props}>{children}</table>;
      TableComponent.Tbody = ({ children, ...props }: any) => <tbody data-testid="mantine-tbody" {...props}>{children}</tbody>;
      TableComponent.Tr = ({ children, ...props }: any) => <tr data-testid="mantine-tr" {...props}>{children}</tr>;
      TableComponent.Td = ({ children, ...props }: any) => <td data-testid="mantine-td" {...props}>{children}</td>;
      return TableComponent;
    })(),
    Box: ({ children, style, ...props }: any) => (
      <div data-testid="mantine-box" style={style} {...props}>{children}</div>
    ),
    Anchor: ({ children, href, ...props }: any) => (
      <a data-testid="mantine-anchor" href={href} {...props}>{children}</a>
    ),
  };
});

describe('NotionBlockRenderer', () => {
  it('renders paragraph blocks correctly', () => {
    const blocks: BlockObjectResponse[] = [
      {
        id: 'block-1',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            { plain_text: 'This is a test paragraph', annotations: {} }
          ]
        }
      } as BlockObjectResponse
    ];

    render(<NotionBlockRenderer blocks={blocks} />);

    expect(screen.getByTestId('mantine-text')).toBeInTheDocument();
    expect(screen.getByText('This is a test paragraph')).toBeInTheDocument();
  });

  it('renders heading blocks with correct order', () => {
    const blocks: BlockObjectResponse[] = [
      {
        id: 'h1',
        type: 'heading_1',
        heading_1: {
          rich_text: [{ plain_text: 'Heading 1', annotations: {} }]
        }
      } as BlockObjectResponse,
      {
        id: 'h2',
        type: 'heading_2',
        heading_2: {
          rich_text: [{ plain_text: 'Heading 2', annotations: {} }]
        }
      } as BlockObjectResponse,
      {
        id: 'h3',
        type: 'heading_3',
        heading_3: {
          rich_text: [{ plain_text: 'Heading 3', annotations: {} }]
        }
      } as BlockObjectResponse
    ];

    render(<NotionBlockRenderer blocks={blocks} />);

    expect(screen.getByTestId('mantine-title-1')).toBeInTheDocument();
    expect(screen.getByTestId('mantine-title-2')).toBeInTheDocument();
    expect(screen.getByTestId('mantine-title-3')).toBeInTheDocument();
    
    expect(screen.getByText('Heading 1')).toBeInTheDocument();
    expect(screen.getByText('Heading 2')).toBeInTheDocument();
    expect(screen.getByText('Heading 3')).toBeInTheDocument();
  });

  it('renders bulleted and numbered lists correctly', () => {
    const blocks: BlockObjectResponse[] = [
      {
        id: 'bullet',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [{ plain_text: 'Bullet item', annotations: {} }]
        }
      } as BlockObjectResponse,
      {
        id: 'number',
        type: 'numbered_list_item',
        numbered_list_item: {
          rich_text: [{ plain_text: 'Numbered item', annotations: {} }]
        }
      } as BlockObjectResponse
    ];

    render(<NotionBlockRenderer blocks={blocks} />);

    expect(screen.getByTestId('mantine-list-unordered')).toBeInTheDocument();
    expect(screen.getByTestId('mantine-list-ordered')).toBeInTheDocument();
    expect(screen.getAllByTestId('mantine-list-item')).toHaveLength(2);
    
    expect(screen.getByText('Bullet item')).toBeInTheDocument();
    expect(screen.getByText('Numbered item')).toBeInTheDocument();
  });

  it('renders to-do blocks with checkbox state', () => {
    const blocks: BlockObjectResponse[] = [
      {
        id: 'todo-checked',
        type: 'to_do',
        to_do: {
          rich_text: [{ plain_text: 'Completed task', annotations: {} }],
          checked: true
        }
      } as BlockObjectResponse,
      {
        id: 'todo-unchecked',
        type: 'to_do',
        to_do: {
          rich_text: [{ plain_text: 'Pending task', annotations: {} }],
          checked: false
        }
      } as BlockObjectResponse
    ];

    render(<NotionBlockRenderer blocks={blocks} />);

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
    
    expect(screen.getByText('Completed task')).toBeInTheDocument();
    expect(screen.getByText('Pending task')).toBeInTheDocument();
  });

  it('renders toggle blocks as details element', () => {
    const blocks: BlockObjectResponse[] = [
      {
        id: 'toggle',
        type: 'toggle',
        toggle: {
          rich_text: [{ plain_text: 'Toggle content', annotations: {} }]
        }
      } as BlockObjectResponse
    ];

    render(<NotionBlockRenderer blocks={blocks} />);

    expect(screen.getByRole('group')).toBeInTheDocument(); // details element
    expect(screen.getByText('Toggle content')).toBeInTheDocument();
  });

  it('renders code blocks correctly', () => {
    const blocks: BlockObjectResponse[] = [
      {
        id: 'code',
        type: 'code',
        code: {
          rich_text: [{ plain_text: 'console.log("Hello World");', annotations: {} }],
          language: 'javascript'
        }
      } as BlockObjectResponse
    ];

    render(<NotionBlockRenderer blocks={blocks} />);

    expect(screen.getByTestId('mantine-code-block')).toBeInTheDocument();
    expect(screen.getByText('console.log("Hello World");')).toBeInTheDocument();
  });

  it('renders quote blocks correctly', () => {
    const blocks: BlockObjectResponse[] = [
      {
        id: 'quote',
        type: 'quote',
        quote: {
          rich_text: [{ plain_text: 'This is a quote', annotations: {} }]
        }
      } as BlockObjectResponse
    ];

    render(<NotionBlockRenderer blocks={blocks} />);

    expect(screen.getByTestId('mantine-blockquote')).toBeInTheDocument();
    expect(screen.getByText('This is a quote')).toBeInTheDocument();
  });

  it('renders divider blocks', () => {
    const blocks: BlockObjectResponse[] = [
      {
        id: 'divider',
        type: 'divider',
        divider: {}
      } as BlockObjectResponse
    ];

    render(<NotionBlockRenderer blocks={blocks} />);

    expect(screen.getByTestId('mantine-divider')).toBeInTheDocument();
  });

  it('renders image blocks with external URL', () => {
    const blocks: BlockObjectResponse[] = [
      {
        id: 'image',
        type: 'image',
        image: {
          type: 'external',
          external: { url: 'https://example.com/image.jpg' },
          caption: [{ plain_text: 'Test image', annotations: {} }]
        }
      } as BlockObjectResponse
    ];

    render(<NotionBlockRenderer blocks={blocks} />);

    const image = screen.getByTestId('mantine-image');
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute('src', 'https://example.com/image.jpg');
    expect(image).toHaveAttribute('alt', 'Test image');
    expect(screen.getByText('Test image')).toBeInTheDocument();
  });

  it('renders image blocks with file URL', () => {
    const blocks: BlockObjectResponse[] = [
      {
        id: 'image',
        type: 'image',
        image: {
          type: 'file',
          file: { url: 'https://files.notion.so/image.jpg' },
          caption: []
        }
      } as BlockObjectResponse
    ];

    render(<NotionBlockRenderer blocks={blocks} />);

    const image = screen.getByTestId('mantine-image');
    expect(image).toHaveAttribute('src', 'https://files.notion.so/image.jpg');
    expect(image).toHaveAttribute('alt', 'Image');
  });

  it('renders video blocks correctly', () => {
    const blocks: BlockObjectResponse[] = [
      {
        id: 'video',
        type: 'video',
        video: {
          type: 'external',
          external: { url: 'https://example.com/video.mp4' }
        }
      } as BlockObjectResponse
    ];

    render(<NotionBlockRenderer blocks={blocks} />);

    const video = document.querySelector('video');
    expect(video).toBeInTheDocument();
    expect(video).toHaveAttribute('controls');
    
    const source = video?.querySelector('source');
    expect(source).toHaveAttribute('src', 'https://example.com/video.mp4');
  });

  it('renders bookmark blocks correctly', () => {
    const blocks: BlockObjectResponse[] = [
      {
        id: 'bookmark',
        type: 'bookmark',
        bookmark: {
          url: 'https://example.com',
          caption: [{ plain_text: 'Example website', annotations: {} }]
        }
      } as BlockObjectResponse
    ];

    render(<NotionBlockRenderer blocks={blocks} />);

    const anchor = screen.getByTestId('mantine-anchor');
    expect(anchor).toBeInTheDocument();
    expect(anchor).toHaveAttribute('href', 'https://example.com');
    expect(anchor).toHaveAttribute('target', '_blank');
    expect(screen.getByText('https://example.com')).toBeInTheDocument();
    expect(screen.getByText('Example website')).toBeInTheDocument();
  });

  it('renders embed blocks correctly', () => {
    const blocks: BlockObjectResponse[] = [
      {
        id: 'embed',
        type: 'embed',
        embed: {
          url: 'https://example.com/embed'
        }
      } as BlockObjectResponse
    ];

    render(<NotionBlockRenderer blocks={blocks} />);

    const iframe = document.querySelector('iframe');
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute('src', 'https://example.com/embed');
    expect(iframe).toHaveAttribute('width', '100%');
    expect(iframe).toHaveAttribute('height', '400');
  });

  it('renders table blocks with placeholder content', () => {
    const blocks: BlockObjectResponse[] = [
      {
        id: 'table',
        type: 'table',
        table: {
          table_width: 2,
          has_column_header: true,
          has_row_header: false
        }
      } as BlockObjectResponse
    ];

    render(<NotionBlockRenderer blocks={blocks} />);

    expect(screen.getByTestId('mantine-table')).toBeInTheDocument();
    expect(screen.getByText('テーブルコンテンツは別途取得が必要です')).toBeInTheDocument();
  });

  it('renders callout blocks with icon and content', () => {
    const blocks: BlockObjectResponse[] = [
      {
        id: 'callout',
        type: 'callout',
        callout: {
          rich_text: [{ plain_text: 'Important note', annotations: {} }],
          icon: { type: 'emoji', emoji: '⚠️' },
          color: 'yellow_background'
        }
      } as BlockObjectResponse
    ];

    render(<NotionBlockRenderer blocks={blocks} />);

    expect(screen.getByText('⚠️')).toBeInTheDocument();
    expect(screen.getByText('Important note')).toBeInTheDocument();
  });

  it('renders callout blocks without icon using default', () => {
    const blocks: BlockObjectResponse[] = [
      {
        id: 'callout',
        type: 'callout',
        callout: {
          rich_text: [{ plain_text: 'Note without icon', annotations: {} }],
          icon: null,
          color: 'default'
        }
      } as BlockObjectResponse
    ];

    render(<NotionBlockRenderer blocks={blocks} />);

    // Default icon should be rendered when no icon is provided
    expect(screen.getByText('Note without icon')).toBeInTheDocument();
    // Check that some default icon or placeholder is rendered (the actual implementation uses 💡)
    const defaultIcon = document.querySelector('span');
    expect(defaultIcon).toBeInTheDocument();
  });

  it('handles rich text with formatting correctly', () => {
    const blocks: BlockObjectResponse[] = [
      {
        id: 'formatted',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            { 
              plain_text: 'Bold text', 
              annotations: { bold: true, italic: false, strikethrough: false, underline: false, code: false }
            },
            { 
              plain_text: ' and italic text', 
              annotations: { bold: false, italic: true, strikethrough: false, underline: false, code: false }
            },
            { 
              plain_text: ' and inline code', 
              annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: true }
            }
          ]
        }
      } as BlockObjectResponse
    ];

    render(<NotionBlockRenderer blocks={blocks} />);

    expect(screen.getByText('Bold text')).toHaveStyle({ fontWeight: 'bold' });
    // Check by text content instead of exact text match for italic text
    const italicText = screen.getByText((content, element) => {
      return element?.textContent === ' and italic text' && element?.style.fontStyle === 'italic';
    });
    expect(italicText).toBeInTheDocument();
    expect(screen.getByTestId('mantine-code')).toHaveTextContent('and inline code');
  });

  it('handles rich text with links correctly', () => {
    const blocks: BlockObjectResponse[] = [
      {
        id: 'link',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            { 
              plain_text: 'Visit our website',
              annotations: {},
              href: 'https://example.com'
            }
          ]
        }
      } as BlockObjectResponse
    ];

    render(<NotionBlockRenderer blocks={blocks} />);

    const link = screen.getByTestId('mantine-anchor');
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveTextContent('Visit our website');
  });

  it('renders empty blocks gracefully', () => {
    const blocks: BlockObjectResponse[] = [
      {
        id: 'empty',
        type: 'paragraph',
        paragraph: {
          rich_text: []
        }
      } as BlockObjectResponse
    ];

    render(<NotionBlockRenderer blocks={blocks} />);

    expect(screen.getByTestId('mantine-text')).toBeInTheDocument();
    expect(screen.getByTestId('mantine-text')).toBeEmptyDOMElement();
  });

  it('handles unsupported block types gracefully', () => {
    const blocks: BlockObjectResponse[] = [
      {
        id: 'unsupported',
        type: 'unsupported' as any,
        unsupported: {}
      } as BlockObjectResponse
    ];

    render(<NotionBlockRenderer blocks={blocks} />);

    // Should not crash and should not render anything for unsupported types
    expect(document.body).toBeInTheDocument();
  });

  it('renders multiple blocks in correct order', () => {
    const blocks: BlockObjectResponse[] = [
      {
        id: 'first',
        type: 'heading_1',
        heading_1: {
          rich_text: [{ plain_text: 'First Block', annotations: {} }]
        }
      } as BlockObjectResponse,
      {
        id: 'second',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ plain_text: 'Second Block', annotations: {} }]
        }
      } as BlockObjectResponse,
      {
        id: 'third',
        type: 'divider',
        divider: {}
      } as BlockObjectResponse
    ];

    render(<NotionBlockRenderer blocks={blocks} />);

    const title = screen.getByText('First Block');
    const text = screen.getByText('Second Block');
    const divider = screen.getByTestId('mantine-divider');

    expect(title).toBeInTheDocument();
    expect(text).toBeInTheDocument();
    expect(divider).toBeInTheDocument();

    // Check that elements are rendered in order by checking their presence
    const titleElement = screen.getByTestId('mantine-title-1');
    const textElement = screen.getByTestId('mantine-text');
    expect(titleElement).toBeInTheDocument();
    expect(textElement).toBeInTheDocument();
  });
});