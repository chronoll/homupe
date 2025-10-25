'use client';

import { Box, Title, Card, Text, Badge, Group, Stack } from '@mantine/core';
import { IconCalendar } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';

interface RelatedArticle {
  id: string;
  title: string;
  date: string;
  tags: string[];
  category: string;
}

interface RelatedArticlesProps {
  articles: RelatedArticle[];
}

export default function RelatedArticles({ articles }: RelatedArticlesProps) {
  const router = useRouter();

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (articles.length === 0) {
    return null;
  }

  return (
    <Box
      style={{
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '12px',
        padding: '2rem',
      }}
    >
      <Title order={2} mb="lg" c="dark">
        関連記事
      </Title>
      
      <Stack gap="md">
        {articles.map((article) => (
          <Card
            key={article.id}
            shadow="sm"
            padding="md"
            radius="md"
            withBorder
            style={{
              cursor: 'pointer',
              background: 'rgba(255, 255, 255, 0.8)',
              transition: 'all 0.2s ease',
            }}
            onClick={() => router.push(`/blog/${article.id}`)}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.05)';
            }}
          >
            <Group justify="space-between" align="flex-start" mb="xs">
              <Title order={4} style={{ flex: 1 }}>
                {article.title}
              </Title>
            </Group>

            <Group justify="space-between" align="center">
              <Group gap="xs">
                {article.category && (
                  <Badge variant="filled" size="xs" color="blue">
                    {article.category}
                  </Badge>
                )}
                {article.tags.slice(0, 2).map((tag) => (
                  <Badge key={tag} variant="light" size="xs">
                    {tag}
                  </Badge>
                ))}
                {article.tags.length > 2 && (
                  <Text size="xs" c="dimmed">
                    +{article.tags.length - 2}
                  </Text>
                )}
              </Group>

              <Group gap="xs">
                <IconCalendar size={14} />
                <Text size="xs" c="dimmed">
                  {formatDate(article.date)}
                </Text>
              </Group>
            </Group>
          </Card>
        ))}
      </Stack>
    </Box>
  );
}