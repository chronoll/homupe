'use client';

import { Text, Title, List, Blockquote, Code, Divider, Image, Table, Box, Anchor } from '@mantine/core';
import { BlockObjectResponse } from '@notionhq/client/build/src/api-endpoints';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface NotionBlockRendererProps {
  blocks: BlockObjectResponse[];
}

export default function NotionBlockRenderer({ blocks }: NotionBlockRendererProps) {
  return (
    <Box style={{ lineHeight: 1.8, color: '#334155' }}>
      {blocks.map((block) => (
        <BlockRenderer key={block.id} block={block} />
      ))}
    </Box>
  );
}

function BlockRenderer({ block }: { block: BlockObjectResponse }) {
  switch (block.type) {
    case 'paragraph':
      return (
        <Text mb="md" style={{ lineHeight: 1.8, color: '#334155' }}>
          <RichTextRenderer richText={block.paragraph.rich_text} />
        </Text>
      );

    case 'heading_1':
      return (
        <Title
          order={2}
          mt={40}
          mb="md"
          style={{
            color: '#1e293b',
            fontWeight: 700,
            letterSpacing: '-0.01em',
            borderBottom: '1px solid #e2e8f0',
            paddingBottom: '0.5rem',
          }}
        >
          <RichTextRenderer richText={block.heading_1.rich_text} />
        </Title>
      );

    case 'heading_2':
      return (
        <Title
          order={3}
          mt={32}
          mb="md"
          style={{
            color: '#1e293b',
            fontWeight: 600,
          }}
        >
          <RichTextRenderer richText={block.heading_2.rich_text} />
        </Title>
      );

    case 'heading_3':
      return (
        <Title
          order={4}
          mt={24}
          mb="sm"
          style={{
            color: '#334155',
            fontWeight: 600,
          }}
        >
          <RichTextRenderer richText={block.heading_3.rich_text} />
        </Title>
      );

    case 'bulleted_list_item':
      return (
        <List type="unordered" mb="xs">
          <List.Item>
            <RichTextRenderer richText={block.bulleted_list_item.rich_text} />
          </List.Item>
        </List>
      );

    case 'numbered_list_item':
      return (
        <List type="ordered" mb="xs">
          <List.Item>
            <RichTextRenderer richText={block.numbered_list_item.rich_text} />
          </List.Item>
        </List>
      );

    case 'to_do':
      return (
        <Box mb="xs" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          <input
            type="checkbox"
            checked={block.to_do.checked}
            readOnly
            style={{ marginTop: '4px', accentColor: '#6366f1' }}
          />
          <Text style={{
            textDecoration: block.to_do.checked ? 'line-through' : 'none',
            color: block.to_do.checked ? '#94a3b8' : '#334155',
          }}>
            <RichTextRenderer richText={block.to_do.rich_text} />
          </Text>
        </Box>
      );

    case 'toggle':
      return (
        <details style={{ marginBottom: '1rem' }}>
          <summary style={{ cursor: 'pointer', userSelect: 'none', color: '#334155', fontWeight: 500 }}>
            <RichTextRenderer richText={block.toggle.rich_text} />
          </summary>
        </details>
      );

    case 'code':
      const codeContent = block.code.rich_text.map(t => t.plain_text).join('');
      const language = block.code.language || 'text';

      return (
        <Box mb="md" style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
          <Box
            style={{
              backgroundColor: '#f8fafc',
              color: '#64748b',
              fontSize: '0.75rem',
              padding: '0.4rem 1rem',
              fontWeight: 500,
              borderBottom: '1px solid #e2e8f0',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {language}
          </Box>
          <SyntaxHighlighter
            language={language}
            style={oneLight}
            customStyle={{
              margin: 0,
              borderRadius: 0,
              fontSize: '0.875rem',
              padding: '1rem',
              background: '#fafbfc',
            }}
          >
            {codeContent}
          </SyntaxHighlighter>
        </Box>
      );

    case 'quote':
      return (
        <Blockquote
          mb="md"
          style={{
            borderLeftColor: '#6366f1',
            backgroundColor: '#fafafe',
            borderRadius: '0 8px 8px 0',
            color: '#475569',
            fontStyle: 'italic',
          }}
        >
          <RichTextRenderer richText={block.quote.rich_text} />
        </Blockquote>
      );

    case 'divider':
      return <Divider my="xl" color="#e2e8f0" />;

    case 'image':
      const imageUrl = block.image.type === 'external'
        ? block.image.external.url
        : block.image.type === 'file'
        ? block.image.file.url
        : '';

      return imageUrl ? (
        <Box mb="md">
          <Box style={{ borderRadius: '8px', overflow: 'hidden' }}>
            <Image
              src={imageUrl}
              alt={block.image.caption?.[0]?.plain_text || 'Image'}
              maw="100%"
            />
          </Box>
          {block.image.caption?.length > 0 && (
            <Text size="sm" c="dimmed" ta="center" mt="xs" style={{ fontSize: '0.8rem' }}>
              <RichTextRenderer richText={block.image.caption} />
            </Text>
          )}
        </Box>
      ) : null;

    case 'video':
      const videoUrl = block.video.type === 'external'
        ? block.video.external.url
        : block.video.type === 'file'
        ? block.video.file.url
        : '';

      return videoUrl ? (
        <Box mb="md" style={{ borderRadius: '8px', overflow: 'hidden' }}>
          <video controls style={{ width: '100%', maxWidth: '100%' }}>
            <source src={videoUrl} />
          </video>
        </Box>
      ) : null;

    case 'bookmark':
      return (
        <Box
          mb="md"
          p="md"
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            backgroundColor: '#fafbfc',
            transition: 'border-color 0.2s ease',
          }}
        >
          <Anchor href={block.bookmark.url} target="_blank" rel="noopener noreferrer" style={{ color: '#6366f1' }}>
            {block.bookmark.url}
          </Anchor>
          {block.bookmark.caption?.length > 0 && (
            <Text size="sm" c="dimmed" mt="xs">
              <RichTextRenderer richText={block.bookmark.caption} />
            </Text>
          )}
        </Box>
      );

    case 'link_preview':
      return (
        <Box
          mb="md"
          p="md"
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            backgroundColor: '#fafbfc',
          }}
        >
          <Anchor
            href={block.link_preview.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: '0.95rem',
              wordBreak: 'break-word',
              color: '#6366f1',
            }}
          >
            {block.link_preview.url}
          </Anchor>
        </Box>
      );

    case 'embed':
      return (
        <Box mb="md" style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
          <iframe
            src={block.embed.url}
            width="100%"
            height="400"
            style={{ border: 'none' }}
          />
        </Box>
      );

    case 'table':
      return (
        <Box mb="md" style={{ overflowX: 'auto' }}>
          <Table>
            <Table.Tbody>
              <Table.Tr>
                <Table.Td>
                  <Text c="dimmed" size="sm">テーブルコンテンツは別途取得が必要です</Text>
                </Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </Box>
      );

    case 'callout':
      return (
        <Box
          mb="md"
          p="md"
          style={{
            backgroundColor: '#f8fafc',
            borderLeft: '3px solid #6366f1',
            borderRadius: '0 8px 8px 0',
          }}
        >
          <Box style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            {block.callout.icon && (
              <span style={{ fontSize: '1.1rem', lineHeight: 1.6 }}>
                {block.callout.icon.type === 'emoji' ? block.callout.icon.emoji : '💡'}
              </span>
            )}
            <Text style={{ color: '#334155', lineHeight: 1.7 }}>
              <RichTextRenderer richText={block.callout.rich_text} />
            </Text>
          </Box>
        </Box>
      );

    default:
      return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RichTextRenderer({ richText }: { richText: any[] }) {
  if (!richText || richText.length === 0) return null;

  return (
    <>
      {richText.map((text, index) => {
        const styles: React.CSSProperties = {};

        if (text.annotations?.bold) styles.fontWeight = 600;
        if (text.annotations?.italic) styles.fontStyle = 'italic';
        if (text.annotations?.strikethrough) styles.textDecoration = 'line-through';
        if (text.annotations?.underline) styles.textDecoration = 'underline';
        if (text.annotations?.code) {
          return (
            <Code
              key={index}
              style={{
                fontSize: '0.875em',
                backgroundColor: '#f1f5f9',
                color: '#6366f1',
                padding: '0.15em 0.4em',
                borderRadius: '4px',
              }}
            >
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
              style={{ ...styles, color: '#6366f1', textDecoration: 'underline', textDecorationColor: '#c7d2fe' }}
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
