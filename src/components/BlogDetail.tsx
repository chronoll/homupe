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
      <Container size="md" py={48}>
        <Button
          component={Link}
          href="/blog"
          variant="subtle"
          leftSection={<IconArrowLeft size={16} />}
          mb={32}
          color="gray"
          style={{
            fontWeight: 500,
            fontSize: '0.875rem',
          }}
        >
          ブログ一覧に戻る
        </Button>

        {/* Article header */}
        <Box mb={32}>
          <Group gap={6} mb={12}>
            <IconCalendar size={14} color="#94a3b8" />
            <Text size="sm" c="dimmed" style={{ fontSize: '0.8rem' }}>
              {formatDate(post.date)}
            </Text>
          </Group>

          <Title
            order={1}
            mb={16}
            style={{
              fontSize: '1.85rem',
              fontWeight: 700,
              color: '#1e293b',
              lineHeight: 1.4,
              letterSpacing: '-0.01em',
            }}
          >
            {post.title}
          </Title>

          <Group gap={6}>
            {post.category && (
              <Badge variant="light" size="sm" color="indigo" style={{ fontWeight: 500 }}>
                {post.category}
              </Badge>
            )}
            {post.tags.map((tag) => (
              <Badge key={tag} variant="outline" size="sm" color="gray" style={{ fontWeight: 400 }}>
                {tag}
              </Badge>
            ))}
          </Group>
        </Box>

        {/* Article body */}
        <Box
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '2.5rem',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
          }}
        >
          {post.aiUsed && (
            <Box
              mb="lg"
              p="sm"
              style={{
                backgroundColor: '#eef2ff',
                border: '1px solid #c7d2fe',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <IconSparkles size={16} color="#6366f1" style={{ flexShrink: 0 }} />
              <Text size="xs" c="indigo.7">
                この記事では、生成AIの力を借りて文章を整えた箇所があります。
              </Text>
            </Box>
          )}
          <NotionBlockRenderer blocks={post.blocks} />
        </Box>

        {/* Related articles */}
        {relatedArticles && relatedArticles.length > 0 && (
          <Box mt={40}>
            <RelatedArticles articles={relatedArticles} />
          </Box>
        )}
      </Container>
    </BlogBackground>
  );
}
