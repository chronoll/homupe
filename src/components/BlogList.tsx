'use client';

import { useRouter } from 'next/navigation';
import { Container, Title, Card, Text, Badge, Group, Stack } from '@mantine/core';
import { IconCalendar } from '@tabler/icons-react';
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
      <Container size="lg" py="xl">
        <Title order={1} mb="xl" c="white">Blog</Title>

        <Stack gap="md">
          {posts.length === 0 ? (
            <Text c="white">ブログ記事がありません。</Text>
          ) : (
            posts.map((post) => (
              <Card
                key={post.id}
                shadow="xl"
                padding="lg"
                radius="md"
                withBorder
                style={{
                  cursor: 'pointer',
                  background: 'rgba(255, 255, 255, 0.95)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  transition: 'all 0.3s ease',
                }}
                onClick={() => router.push(`/blog/${post.id}`)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = '0 20px 40px rgba(0, 0, 0, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 10px 25px rgba(0, 0, 0, 0.1)';
                }}
              >
              <Group justify="flex-start" mb="xs">
                <Title order={3}>{post.title}</Title>
              </Group>

              <Group justify="space-between" align="center">
                <Group gap="xs">
                  {post.category && (
                    <Badge variant="filled" size="sm" color="blue">
                      {post.category}
                    </Badge>
                  )}
                  {post.tags.map((tag) => (
                    <Badge key={tag} variant="light" size="sm">
                      {tag}
                    </Badge>
                  ))}
                </Group>

                <Group gap="xs">
                  <IconCalendar size={16} />
                  <Text size="sm" c="dimmed">
                    {formatDate(post.date)}
                  </Text>
                </Group>
              </Group>
            </Card>
          ))
          )}
        </Stack>
      </Container>
    </BlogBackground>
  );
}
