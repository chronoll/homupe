'use client';

import { useRouter } from 'next/navigation';
import { Container, Title, Card, Text, Badge, Group, Stack } from '@mantine/core';
import { IconCalendar, IconArrowRight } from '@tabler/icons-react';
import BlogBackground from '@/components/BlogBackground';
import { BlogPost } from '@/lib/notion';

interface BlogListProps {
  posts: BlogPost[];
}

export default function BlogList({ posts }: BlogListProps) {
  const router = useRouter();

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
        <Title
          order={1}
          mb={40}
          style={{
            fontSize: '2rem',
            fontWeight: 700,
            color: '#1e293b',
            letterSpacing: '-0.02em',
          }}
        >
          Blog
        </Title>

        <Stack gap="lg">
          {posts.length === 0 ? (
            <Text c="dimmed" size="lg">ブログ記事がありません。</Text>
          ) : (
            posts.map((post) => (
              <Card
                key={post.id}
                padding="xl"
                radius="lg"
                style={{
                  cursor: 'pointer',
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                  transition: 'all 0.2s ease',
                }}
                onClick={() => router.push(`/blog/${post.id}`)}
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
                    <Group gap="xs" mb={8}>
                      <IconCalendar size={14} color="#94a3b8" />
                      <Text size="sm" c="dimmed" style={{ fontSize: '0.8rem' }}>
                        {formatDate(post.date)}
                      </Text>
                    </Group>

                    <Title
                      order={3}
                      mb={12}
                      style={{
                        fontSize: '1.15rem',
                        fontWeight: 600,
                        color: '#1e293b',
                        lineHeight: 1.5,
                      }}
                    >
                      {post.title}
                    </Title>

                    <Group gap={6}>
                      {post.category && (
                        <Badge
                          variant="light"
                          size="sm"
                          color="indigo"
                          style={{ fontWeight: 500 }}
                        >
                          {post.category}
                        </Badge>
                      )}
                      {post.tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="outline"
                          size="sm"
                          color="gray"
                          style={{ fontWeight: 400 }}
                        >
                          {tag}
                        </Badge>
                      ))}
                    </Group>
                  </div>

                  <IconArrowRight
                    size={18}
                    color="#94a3b8"
                    style={{ flexShrink: 0, marginTop: '2px' }}
                  />
                </Group>
              </Card>
            ))
          )}
        </Stack>
      </Container>
    </BlogBackground>
  );
}
