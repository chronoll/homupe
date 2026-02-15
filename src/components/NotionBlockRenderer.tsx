'use client';

import { Text, Title, List, Blockquote, Code, Divider, Image, Table, Box, Anchor } from '@mantine/core';
import { BlockObjectResponse } from '@notionhq/client/build/src/api-endpoints';

interface NotionBlockRendererProps {
  blocks: BlockObjectResponse[];
}

export default function NotionBlockRenderer({ blocks }: NotionBlockRendererProps) {
  return (
    <>
      {blocks.map((block) => (
        <BlockRenderer key={block.id} block={block} />
      ))}
    </>
  );
}

function BlockRenderer({ block }: { block: BlockObjectResponse }) {
  switch (block.type) {
    case 'paragraph':
      return (
        <Text mb="md">
          <RichTextRenderer richText={block.paragraph.rich_text} />
        </Text>
      );

    case 'heading_1':
      return (
        <Title order={1} mt="xl" mb="md">
          <RichTextRenderer richText={block.heading_1.rich_text} />
        </Title>
      );

    case 'heading_2':
      return (
        <Title order={2} mt="lg" mb="md">
          <RichTextRenderer richText={block.heading_2.rich_text} />
        </Title>
      );

    case 'heading_3':
      return (
        <Title order={3} mt="md" mb="sm">
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
            style={{ marginTop: '4px' }}
          />
          <Text style={{ textDecoration: block.to_do.checked ? 'line-through' : 'none' }}>
            <RichTextRenderer richText={block.to_do.rich_text} />
          </Text>
        </Box>
      );

    case 'toggle':
      return (
        <details style={{ marginBottom: '1rem' }}>
          <summary style={{ cursor: 'pointer', userSelect: 'none' }}>
            <RichTextRenderer richText={block.toggle.rich_text} />
          </summary>
        </details>
      );

    case 'code':
      return (
        <Code block mb="md" style={{ padding: '1rem' }}>
          <RichTextRenderer richText={block.code.rich_text} />
        </Code>
      );

    case 'quote':
      return (
        <Blockquote mb="md">
          <RichTextRenderer richText={block.quote.rich_text} />
        </Blockquote>
      );

    case 'divider':
      return <Divider my="xl" />;

    case 'image':
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

    case 'video':
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
        </Box>
      ) : null;

    case 'bookmark':
      return (
        <Box mb="md" p="md" style={{ border: '1px solid #e0e0e0', borderRadius: '8px' }}>
          <Anchor href={block.bookmark.url} target="_blank" rel="noopener noreferrer">
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
            border: '1px solid #e0e0e0',
            borderRadius: '8px',
            backgroundColor: '#fafafa'
          }}
        >
          <Anchor
            href={block.link_preview.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: '0.95rem',
              wordBreak: 'break-word'
            }}
          >
            {block.link_preview.url}
          </Anchor>
        </Box>
      );

    case 'embed':
      return (
        <Box mb="md">
          <iframe
            src={block.embed.url}
            width="100%"
            height="400"
            style={{ border: 'none', borderRadius: '8px' }}
          />
        </Box>
      );

    case 'table':
      // Tableブロックは子ブロックを別途取得する必要があるため、
      // ここでは簡易的な実装とする
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
            backgroundColor: '#f5f5f5', 
            borderLeft: '4px solid #4a90e2',
            borderRadius: '4px'
          }}
        >
          <Box style={{ display: 'flex', gap: '8px' }}>
            {block.callout.icon && (
              <span>{block.callout.icon.type === 'emoji' ? block.callout.icon.emoji : '💡'}</span>
            )}
            <Text>
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
        
        if (text.annotations?.bold) styles.fontWeight = 'bold';
        if (text.annotations?.italic) styles.fontStyle = 'italic';
        if (text.annotations?.strikethrough) styles.textDecoration = 'line-through';
        if (text.annotations?.underline) styles.textDecoration = 'underline';
        if (text.annotations?.code) {
          return (
            <Code key={index} style={{ fontSize: 'inherit' }}>
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