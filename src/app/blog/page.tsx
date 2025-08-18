'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Container, Title, Card, Text, Badge, Group, Stack, Loader, Alert } from '@mantine/core';
import { IconExternalLink, IconCalendar, IconAlertCircle } from '@tabler/icons-react';
import BlogBackground from '@/components/BlogBackground';

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
      <BlogBackground>
        <Container size="lg" py="xl">
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
            <Loader size="lg" />
          </div>
        </Container>
      </BlogBackground>
    );
  }

  if (error) {
    return (
      <BlogBackground>
        <Container size="lg" py="xl">
          <Alert icon={<IconAlertCircle size="1rem" />} title="エラー" color="red">
            {error}
          </Alert>
        </Container>
      </BlogBackground>
    );
  }

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
    </BlogBackground>
  );
}
