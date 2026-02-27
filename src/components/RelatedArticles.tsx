'use client';

import { Box, Title, Card, Text, Badge, Group, Stack } from '@mantine/core';
import { IconCalendar, IconArrowRight } from '@tabler/icons-react';
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
    <Box>
      <Title
        order={2}
        mb="lg"
        style={{
          fontSize: '1.25rem',
          fontWeight: 600,
          color: '#1e293b',
        }}
      >
        関連記事
      </Title>

      <Stack gap="md">
        {articles.map((article) => (
          <Card
            key={article.id}
            padding="lg"
            radius="lg"
            style={{
              cursor: 'pointer',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
              transition: 'all 0.2s ease',
            }}
            onClick={() => router.push(`/blog/${article.id}`)}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.08)';
              e.currentTarget.style.borderColor = '#c7d2fe';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.04)';
              e.currentTarget.style.borderColor = '#e2e8f0';
            }}
          >
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <div style={{ flex: 1, minWidth: 0 }}>
                <Title
                  order={4}
                  mb={8}
                  style={{
                    fontSize: '1rem',
                    fontWeight: 600,
                    color: '#1e293b',
                    lineHeight: 1.5,
                  }}
                >
                  {article.title}
                </Title>

                <Group justify="space-between" align="center">
                  <Group gap={6}>
                    {article.category && (
                      <Badge variant="light" size="xs" color="indigo" style={{ fontWeight: 500 }}>
                        {article.category}
                      </Badge>
                    )}
                    {article.tags.slice(0, 2).map((tag) => (
                      <Badge key={tag} variant="outline" size="xs" color="gray" style={{ fontWeight: 400 }}>
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
                    <IconCalendar size={12} color="#94a3b8" />
                    <Text size="xs" c="dimmed">
                      {formatDate(article.date)}
                    </Text>
                  </Group>
                </Group>
              </div>

              <IconArrowRight
                size={16}
                color="#94a3b8"
                style={{ flexShrink: 0, marginTop: '2px' }}
              />
            </Group>
          </Card>
        ))}
      </Stack>
    </Box>
  );
}
