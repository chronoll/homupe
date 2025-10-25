import { Container, Title, Group, Badge, Text, Alert, Button, Box } from '@mantine/core';
import { IconArrowLeft, IconCalendar, IconAlertCircle } from '@tabler/icons-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getBlogPosts, getBlogPost } from '@/lib/notion';
import NotionBlockRenderer from '@/components/NotionBlockRenderer';
import BlogBackground from '@/components/BlogBackground';
import RelatedArticles from '@/components/RelatedArticles';

// ISR と SSG の設定
export const revalidate = 3600; // 1時間ごとに再生成

// ビルド時に静的生成するパスを定義
export async function generateStaticParams() {
  try {
    const posts = await getBlogPosts();
    return posts.map((post) => ({
      id: post.id,
    }));
  } catch (error) {
    console.error('Failed to generate static params:', error);
    return [];
  }
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

interface BlogDetailPageProps {
  params: {
    id: string;
  };
}

export default async function BlogDetailPage({ params }: BlogDetailPageProps) {
  const post = await getBlogPost(params.id);

  if (!post) {
    notFound();
  }

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
          <NotionBlockRenderer blocks={post.blocks} />
        </Box>

        {post.relatedArticles && post.relatedArticles.length > 0 && (
          <Box mt="xl">
            <RelatedArticles articles={post.relatedArticles} />
          </Box>
        )}
      </Container>
    </BlogBackground>
  );
}
