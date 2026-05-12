'use client';

import { Text, Title, Blockquote, Code, Divider, Image, Table, Box, Anchor } from '@mantine/core';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { BlockWithChildren } from '@/lib/notion';
import type { LinkMetadata, GitHubPermalinkMetadata, OgpMetadata } from '@/lib/ogp';

const NOTION_TEXT_COLOR_MAP: Record<string, string> = {
  gray: '#787774',
  brown: '#9F6B53',
  orange: '#D9730D',
  yellow: '#CB912F',
  green: '#448361',
  blue: '#337EA9',
  purple: '#9065B0',
  pink: '#C14C8A',
  red: '#D44C47',
};

const NOTION_BG_COLOR_MAP: Record<string, string> = {
  gray_background: '#F1F1EF',
  brown_background: '#F4EEEE',
  orange_background: '#FAEBDD',
  yellow_background: '#FBF3DB',
  green_background: '#EEF3ED',
  blue_background: '#E7F3F8',
  purple_background: '#F4F0F7',
  pink_background: '#F9EEF3',
  red_background: '#FDEBEC',
};

function colorToStyle(color?: string | null): React.CSSProperties {
  if (!color || color === 'default') return {};
  if (color.endsWith('_background')) {
    const bg = NOTION_BG_COLOR_MAP[color];
    return bg ? { backgroundColor: bg } : {};
  }
  const c = NOTION_TEXT_COLOR_MAP[color];
  return c ? { color: c } : {};
}

interface NotionBlockRendererProps {
  blocks: BlockWithChildren[];
}

export default function NotionBlockRenderer({ blocks }: NotionBlockRendererProps) {
  const elements: React.ReactNode[] = [];
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    if (block.type === 'bulleted_list_item' || block.type === 'numbered_list_item') {
      const listType = block.type;
      const items: BlockWithChildren[] = [];
      while (i < blocks.length && blocks[i].type === listType) {
        items.push(blocks[i]);
        i++;
      }
      elements.push(<ListGroup key={items[0].id} type={listType} items={items} />);
    } else {
      elements.push(<BlockRenderer key={block.id} block={block} />);
      i++;
    }
  }
  return <>{elements}</>;
}

function ListGroup({
  type,
  items,
}: {
  type: 'bulleted_list_item' | 'numbered_list_item';
  items: BlockWithChildren[];
}) {
  const ListTag = type === 'bulleted_list_item' ? 'ul' : 'ol';
  return (
    <Box
      component={ListTag}
      mb="md"
      style={{ paddingLeft: '1.5rem', minWidth: 0, maxWidth: '100%' }}
    >
      {items.map((item) => {
        const data =
          item.type === 'bulleted_list_item'
            ? item.bulleted_list_item
            : item.type === 'numbered_list_item'
              ? item.numbered_list_item
              : null;
        if (!data) return null;
        return (
          <Box
            key={item.id}
            component="li"
            mb="xs"
            style={{ minWidth: 0, maxWidth: '100%' }}
          >
            <span style={{ ...colorToStyle(data.color), wordBreak: 'break-word' }}>
              <RichTextRenderer richText={data.rich_text} />
            </span>
            {item.has_children && item.children?.length ? (
              <Box mt="xs" style={{ minWidth: 0, maxWidth: '100%' }}>
                <NotionBlockRenderer blocks={item.children} />
              </Box>
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
}

function ChildrenBox({
  block,
  indent = true,
}: {
  block: BlockWithChildren;
  indent?: boolean;
}) {
  if (!block.has_children || !block.children?.length) return null;
  return (
    <Box pl={indent ? 'md' : 0} mb="sm" style={{ minWidth: 0, maxWidth: '100%' }}>
      <NotionBlockRenderer blocks={block.children} />
    </Box>
  );
}

function BlockRenderer({ block }: { block: BlockWithChildren }) {
  switch (block.type) {
    case 'paragraph':
      return (
        <>
          <Text mb="md" style={colorToStyle(block.paragraph.color)}>
            <RichTextRenderer richText={block.paragraph.rich_text} />
          </Text>
          <ChildrenBox block={block} />
        </>
      );

    case 'heading_1':
      return (
        <>
          <Title order={1} mt="xl" mb="md" style={colorToStyle(block.heading_1.color)}>
            <RichTextRenderer richText={block.heading_1.rich_text} />
          </Title>
          {block.heading_1.is_toggleable ? <ChildrenBox block={block} /> : null}
        </>
      );

    case 'heading_2':
      return (
        <>
          <Title order={2} mt="lg" mb="md" style={colorToStyle(block.heading_2.color)}>
            <RichTextRenderer richText={block.heading_2.rich_text} />
          </Title>
          {block.heading_2.is_toggleable ? <ChildrenBox block={block} /> : null}
        </>
      );

    case 'heading_3':
      return (
        <>
          <Title order={3} mt="md" mb="sm" style={colorToStyle(block.heading_3.color)}>
            <RichTextRenderer richText={block.heading_3.rich_text} />
          </Title>
          {block.heading_3.is_toggleable ? <ChildrenBox block={block} /> : null}
        </>
      );

    case 'bulleted_list_item':
    case 'numbered_list_item':
      return null;

    case 'to_do':
      return (
        <>
          <Box mb="xs" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
            <input
              type="checkbox"
              checked={block.to_do.checked}
              readOnly
              style={{ marginTop: '4px' }}
            />
            <Text
              style={{
                ...colorToStyle(block.to_do.color),
                textDecoration: block.to_do.checked ? 'line-through' : 'none',
              }}
            >
              <RichTextRenderer richText={block.to_do.rich_text} />
            </Text>
          </Box>
          <ChildrenBox block={block} />
        </>
      );

    case 'toggle':
      return (
        <details style={{ marginBottom: '1rem', ...colorToStyle(block.toggle.color) }}>
          <summary style={{ cursor: 'pointer', userSelect: 'none' }}>
            <RichTextRenderer richText={block.toggle.rich_text} />
          </summary>
          <ChildrenBox block={block} />
        </details>
      );

    case 'code': {
      const codeContent = block.code.rich_text.map(t => t.plain_text).join('');
      const language = block.code.language || 'text';

      return (
        <Box mb="md" style={{ position: 'relative', maxWidth: '100%', minWidth: 0 }}>
          <Box
            style={{
              backgroundColor: '#2d2d2d',
              color: '#ccc',
              fontSize: '0.85rem',
              padding: '0.5rem 1rem',
              borderTopLeftRadius: '4px',
              borderTopRightRadius: '4px',
              fontWeight: 500,
              borderBottom: '1px solid #1a1a1a'
            }}
          >
            {language}
          </Box>
          <SyntaxHighlighter
            language={language}
            style={tomorrow}
            customStyle={{
              margin: 0,
              borderTopLeftRadius: 0,
              borderTopRightRadius: 0,
              borderBottomLeftRadius: '4px',
              borderBottomRightRadius: '4px',
              fontSize: '0.9rem',
              padding: '1rem',
              overflowX: 'auto',
              maxWidth: '100%',
            }}
          >
            {codeContent}
          </SyntaxHighlighter>
          {block.code.caption?.length > 0 && (
            <Text size="sm" c="dimmed" mt="xs">
              <RichTextRenderer richText={block.code.caption} />
            </Text>
          )}
        </Box>
      );
    }

    case 'quote':
      return (
        <>
          <Blockquote mb="md" style={colorToStyle(block.quote.color)}>
            <RichTextRenderer richText={block.quote.rich_text} />
          </Blockquote>
          <ChildrenBox block={block} />
        </>
      );

    case 'divider':
      return <Divider my="xl" />;

    case 'image': {
      const imageUrl = block.image.type === 'external'
        ? block.image.external.url
        : block.image.type === 'file'
        ? block.image.file.url
        : '';

      return imageUrl ? (
        <Box mb="md">
          <Image
            src={imageUrl}
            alt={block.image.caption?.[0]?.plain_text || 'Image'}
            maw="100%"
          />
          {block.image.caption?.length > 0 && (
            <Text size="sm" c="dimmed" ta="center" mt="xs">
              <RichTextRenderer richText={block.image.caption} />
            </Text>
          )}
        </Box>
      ) : null;
    }

    case 'video': {
      const videoUrl = block.video.type === 'external'
        ? block.video.external.url
        : block.video.type === 'file'
        ? block.video.file.url
        : '';

      return videoUrl ? (
        <Box mb="md">
          <video controls style={{ width: '100%', maxWidth: '100%' }}>
            <source src={videoUrl} />
          </video>
          {block.video.caption?.length > 0 && (
            <Text size="sm" c="dimmed" ta="center" mt="xs">
              <RichTextRenderer richText={block.video.caption} />
            </Text>
          )}
        </Box>
      ) : null;
    }

    case 'bookmark': {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const metadata = (block.bookmark as any).metadata as LinkMetadata | undefined;
      return (
        <LinkPreviewCard
          url={block.bookmark.url}
          metadata={metadata}
          caption={block.bookmark.caption}
        />
      );
    }

    case 'link_preview': {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const metadata = (block.link_preview as any).metadata as LinkMetadata | undefined;
      return <LinkPreviewCard url={block.link_preview.url} metadata={metadata} />;
    }

    case 'embed':
      return (
        <Box mb="md">
          <iframe
            src={block.embed.url}
            width="100%"
            height="400"
            style={{ border: 'none', borderRadius: '8px' }}
          />
          {block.embed.caption?.length > 0 && (
            <Text size="sm" c="dimmed" mt="xs">
              <RichTextRenderer richText={block.embed.caption} />
            </Text>
          )}
        </Box>
      );

    case 'table': {
      const rows = (block.children || []).filter(
        (c): c is BlockWithChildren & { type: 'table_row' } => c.type === 'table_row',
      );
      if (rows.length === 0) return null;
      const hasColumnHeader = block.table.has_column_header;
      const hasRowHeader = block.table.has_row_header;
      return (
        <Box mb="md" style={{ overflowX: 'auto' }}>
          <Table withTableBorder withColumnBorders>
            <Table.Tbody>
              {rows.map((row, rowIndex) => (
                <Table.Tr key={row.id}>
                  {row.table_row.cells.map((cell, cellIndex) => {
                    const isHeader =
                      (hasColumnHeader && rowIndex === 0) ||
                      (hasRowHeader && cellIndex === 0);
                    const Cell = isHeader ? Table.Th : Table.Td;
                    return (
                      <Cell key={cellIndex}>
                        <RichTextRenderer richText={cell} />
                      </Cell>
                    );
                  })}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Box>
      );
    }

    case 'table_row':
      return null;

    case 'callout':
      return (
        <Box
          mb="md"
          p="md"
          style={{
            backgroundColor: '#f5f5f5',
            borderLeft: '4px solid #4a90e2',
            borderRadius: '4px',
            ...colorToStyle(block.callout.color),
          }}
        >
          <Box style={{ display: 'flex', gap: '8px' }}>
            {block.callout.icon && (
              <span>{block.callout.icon.type === 'emoji' ? block.callout.icon.emoji : '💡'}</span>
            )}
            <Box style={{ flex: 1 }}>
              <Text>
                <RichTextRenderer richText={block.callout.rich_text} />
              </Text>
              <ChildrenBox block={block} indent={false} />
            </Box>
          </Box>
        </Box>
      );

    default:
      return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function LinkPreviewCard({
  url,
  metadata,
  caption,
}: {
  url: string;
  metadata?: LinkMetadata;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  caption?: any[];
}) {
  if (metadata?.type === 'github-permalink') {
    return <GitHubPermalinkCard meta={metadata} caption={caption} />;
  }
  if (metadata?.type === 'ogp') {
    return <OgpCard url={url} meta={metadata} caption={caption} />;
  }
  // metadata が取れていない場合のフォールバック
  return (
    <Box
      mb="md"
      p="md"
      style={{
        border: '1px solid #e0e0e0',
        borderRadius: '8px',
        backgroundColor: '#fafafa',
        maxWidth: '100%',
        minWidth: 0,
      }}
    >
      <Anchor
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ fontSize: '0.95rem', wordBreak: 'break-all' }}
      >
        {url}
      </Anchor>
      {caption && caption.length > 0 ? (
        <Text size="sm" c="dimmed" mt="xs">
          <RichTextRenderer richText={caption} />
        </Text>
      ) : null}
    </Box>
  );
}

function OgpCard({
  url,
  meta,
  caption,
}: {
  url: string;
  meta: OgpMetadata;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  caption?: any[];
}) {
  let host = meta.siteName;
  if (!host) {
    try {
      host = new URL(url).hostname;
    } catch {
      host = url;
    }
  }
  return (
    <Box mb="md" style={{ maxWidth: '100%', minWidth: 0 }}>
      <Anchor
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ textDecoration: 'none', color: 'inherit' }}
      >
        <Box
          style={{
            display: 'flex',
            border: '1px solid #e0e0e0',
            borderRadius: '8px',
            overflow: 'hidden',
            background: '#fff',
          }}
        >
          <Box style={{ flex: 1, minWidth: 0, padding: '0.75rem 1rem' }}>
            {meta.title ? (
              <Text fw={600} lineClamp={2} style={{ wordBreak: 'break-word' }}>
                {meta.title}
              </Text>
            ) : null}
            {meta.description ? (
              <Text
                size="sm"
                c="dimmed"
                lineClamp={2}
                mt="xs"
                style={{ wordBreak: 'break-word' }}
              >
                {meta.description}
              </Text>
            ) : null}
            <Text size="xs" c="dimmed" mt="xs" style={{ wordBreak: 'break-all' }}>
              {host}
            </Text>
          </Box>
          {meta.image ? (
            <Box
              style={{
                width: 160,
                flexShrink: 0,
                background: '#f5f5f5',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={meta.image}
                alt=""
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
            </Box>
          ) : null}
        </Box>
      </Anchor>
      {caption && caption.length > 0 ? (
        <Text size="sm" c="dimmed" mt="xs">
          <RichTextRenderer richText={caption} />
        </Text>
      ) : null}
    </Box>
  );
}

function GitHubPermalinkCard({
  meta,
  caption,
}: {
  meta: GitHubPermalinkMetadata;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  caption?: any[];
}) {
  const lineLabel =
    meta.startLine === meta.endLine
      ? `L${meta.startLine}`
      : `L${meta.startLine}-L${meta.endLine}`;
  const headerLabel = `${meta.owner}/${meta.repo} · ${meta.path} ${lineLabel}`;
  return (
    <Box mb="md" style={{ maxWidth: '100%', minWidth: 0 }}>
      <Box
        style={{
          backgroundColor: '#2d2d2d',
          color: '#ccc',
          fontSize: '0.85rem',
          padding: '0.5rem 1rem',
          borderTopLeftRadius: '4px',
          borderTopRightRadius: '4px',
          fontWeight: 500,
          borderBottom: '1px solid #1a1a1a',
          display: 'flex',
          justifyContent: 'space-between',
          gap: '0.5rem',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <Anchor
          href={meta.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: '#9ec5fe',
            textDecoration: 'none',
            wordBreak: 'break-all',
            fontSize: '0.85rem',
          }}
        >
          {headerLabel}
        </Anchor>
        <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
          GitHub
        </Text>
      </Box>
      <SyntaxHighlighter
        language={meta.language}
        style={tomorrow}
        showLineNumbers
        startingLineNumber={meta.startLine}
        customStyle={{
          margin: 0,
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          borderBottomLeftRadius: '4px',
          borderBottomRightRadius: '4px',
          fontSize: '0.85rem',
          padding: '1rem',
          overflowX: 'auto',
          maxWidth: '100%',
        }}
      >
        {meta.code}
      </SyntaxHighlighter>
      {caption && caption.length > 0 ? (
        <Text size="sm" c="dimmed" mt="xs">
          <RichTextRenderer richText={caption} />
        </Text>
      ) : null}
    </Box>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RichTextRenderer({ richText }: { richText: any[] }) {
  if (!richText || richText.length === 0) return null;

  return (
    <>
      {richText.map((text, index) => {
        const styles: React.CSSProperties = {
          ...colorToStyle(text.annotations?.color),
        };

        if (text.annotations?.bold) styles.fontWeight = 'bold';
        if (text.annotations?.italic) styles.fontStyle = 'italic';
        if (text.annotations?.strikethrough) styles.textDecoration = 'line-through';
        if (text.annotations?.underline) styles.textDecoration = 'underline';
        if (text.annotations?.code) {
          return (
            <Code key={index} style={{ ...styles, fontSize: 'inherit' }}>
              {text.plain_text}
            </Code>
          );
        }

        if (text.href) {
          return (
            <Anchor
              key={index}
              href={text.href}
              target="_blank"
              rel="noopener noreferrer"
              style={styles}
            >
              {text.plain_text}
            </Anchor>
          );
        }

        return (
          <span key={index} style={styles}>
            {text.plain_text}
          </span>
        );
      })}
    </>
  );
}
