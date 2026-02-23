'use client';

import { Container, Title, Group, Badge, Text, Button, Box } from '@mantine/core';
import { IconArrowLeft, IconCalendar, IconSparkles } from '@tabler/icons-react';
import Link from 'next/link';
import NotionBlockRenderer from '@/components/NotionBlockRenderer';
import BlogBackground from '@/components/BlogBackground';
import RelatedArticles from '@/components/RelatedArticles';
import { BlockObjectResponse } from '@notionhq/client/build/src/api-endpoints';
import { BlogPost } from '@/lib/notion';

interface BlogDetailProps {
  post: {
    title: string;
    date: string;
    tags: string[];
    category: string;
    aiUsed?: boolean;
    blocks: BlockObjectResponse[];
  };
  relatedArticles: BlogPost[];
}

export default function BlogDetail({ post, relatedArticles }: BlogDetailProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <BlogBackground>
      <Container size="md" py="xl">
        <Button 
          component={Link} 
          href="/blog" 
          variant="light" 
          leftSection={<IconArrowLeft size={16} />}
          mb="xl"
          c="white"
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
          }}
        >
          ブログ一覧に戻る
        </Button>

        <Box 
          mb="xl"
          style={{
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '12px',
            padding: '2rem',
          }}
        >
          <Title order={1} mb="md">{post.title}</Title>
        
          <Group justify="space-between" align="center" mb="xl">
            <Group gap="xs">
              {post.category && (
                <Badge variant="filled" size="md" color="blue">
                  {post.category}
                </Badge>
              )}
              {post.tags.map((tag) => (
                <Badge key={tag} variant="light" size="md">
                  {tag}
                </Badge>
              ))}
            </Group>

            <Group gap="xs">
              <IconCalendar size={18} />
              <Text size="sm" c="dimmed">
                {formatDate(post.date)}
              </Text>
            </Group>
          </Group>
        </Box>

        <Box
          style={{
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '12px',
            padding: '2rem',
          }}
        >
          {post.aiUsed && (
            <Box
              mb="md"
              p="sm"
              style={{
                backgroundColor: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <IconSparkles size={16} color="#3b82f6" style={{ flexShrink: 0 }} />
              <Text size="xs" c="blue.7">
                この記事では、生成AIの力を借りて文章を整えた箇所があります。
              </Text>
            </Box>
          )}
          <NotionBlockRenderer blocks={post.blocks} />
        </Box>

        {/* 関連記事セクション */}
        {relatedArticles && relatedArticles.length > 0 && (
          <Box mt="xl">
            <RelatedArticles articles={relatedArticles} />
          </Box>
        )}
      </Container>
    </BlogBackground>
  );
}
