'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Container, Title, Card, Text, Badge, Group, Stack, Loader, Alert } from '@mantine/core';
import { IconExternalLink, IconCalendar, IconAlertCircle } from '@tabler/icons-react';

interface BlogPost {
  id: string;
  title: string;
  date: string;
  tags: string[];
  category: string;
  url: string;
}

export default function BlogPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBlogPosts();
  }, []);

  const fetchBlogPosts = async () => {
    try {
      const response = await fetch('/api/notion/blog');
      if (!response.ok) {
        throw new Error('Failed to fetch blog posts');
      }
      const data = await response.json();
      setPosts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <Container size="lg" py="xl">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
          <Loader size="lg" />
        </div>
      </Container>
    );
  }

  if (error) {
    return (
      <Container size="lg" py="xl">
        <Alert icon={<IconAlertCircle size="1rem" />} title="エラー" color="red">
          {error}
        </Alert>
      </Container>
    );
  }

  return (
    <Container size="lg" py="xl">
      <Title order={1} mb="xl">Blog</Title>
      
      <Stack gap="md">
        {posts.length === 0 ? (
          <Text c="dimmed">ブログ記事がありません。</Text>
        ) : (
          posts.map((post) => (
            <Card 
              key={post.id} 
              shadow="sm" 
              padding="lg" 
              radius="md" 
              withBorder
              style={{ cursor: 'pointer' }}
              onClick={() => router.push(`/blog/${post.id}`)}
            >
              <Group justify="space-between" mb="xs">
                <Title order={3}>{post.title}</Title>
                {post.url && (
                  <a 
                    href={post.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <IconExternalLink size={20} style={{ cursor: 'pointer' }} />
                  </a>
                )}
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
  );
}
