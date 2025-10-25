import { Container, Title, Card, Text, Badge, Group, Stack, Alert } from '@mantine/core';
import { IconCalendar, IconAlertCircle } from '@tabler/icons-react';
import Link from 'next/link';
import { getBlogPosts } from '@/lib/notion';
import BlogBackground from '@/components/BlogBackground';

// ISR (Incremental Static Regeneration) を設定
export const revalidate = 3600; // 1時間ごとに再生成

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

export default async function BlogPage() {
  let posts;
  let error = null;

  try {
    posts = await getBlogPosts();
  } catch (err) {
    error = err instanceof Error ? err.message : 'An error occurred';
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
          {!posts || posts.length === 0 ? (
            <Text c="white">ブログ記事がありません。</Text>
          ) : (
            posts.map((post) => (
              <Link href={`/blog/${post.id}`} key={post.id} style={{ textDecoration: 'none' }}>
                <Card 
                  shadow="xl" 
                  padding="lg" 
                  radius="md" 
                  withBorder
                  className="blog-card" // ホバーエフェクト用のクラス
                  style={{ 
                    background: 'rgba(255, 255, 255, 0.95)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    transition: 'all 0.3s ease',
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
              </Link>
            ))
          )}
        </Stack>
      </Container>
    </BlogBackground>
  );
}