'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { notFound } from 'next/navigation';
import { Container, Title, Group, Badge, Text, Loader, Alert, Button, Box } from '@mantine/core';
import { IconArrowLeft, IconCalendar, IconAlertCircle } from '@tabler/icons-react';
import Link from 'next/link';
import NotionBlockRenderer from '@/components/NotionBlockRenderer';
import BlogBackground from '@/components/BlogBackground';
import RelatedArticles from '@/components/RelatedArticles';
import { BlockObjectResponse } from '@notionhq/client/build/src/api-endpoints';

interface RelatedArticle {
  id: string;
  title: string;
  date: string;
  tags: string[];
  category: string;
}

interface BlogPost {
  id: string;
  title: string;
  date: string;
  tags: string[];
  category: string;
  blocks: BlockObjectResponse[];
  relatedArticles: RelatedArticle[];
}

export default function BlogDetailPage() {
  const params = useParams();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (params?.id) {
      fetchBlogPost(params.id as string);
    }
  }, [params?.id]);

  const fetchBlogPost = async (id: string) => {
    try {
      const response = await fetch(`/api/notion/blog/${id}`);
      if (response.status === 404) {
        notFound();
        return;
      }
      if (!response.ok) {
        throw new Error('Failed to fetch blog post');
      }
      const data = await response.json();
      setPost(data);
    } catch (err) {
      if (err instanceof Error && err.message.includes('404')) {
        notFound();
        return;
      }
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
        <Container size="md" py="xl">
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
            <Loader size="lg" />
          </div>
        </Container>
      </BlogBackground>
    );
  }

  if (error || !post) {
    return (
      <BlogBackground>
        <Container size="md" py="xl">
          <Alert icon={<IconAlertCircle size="1rem" />} title="エラー" color="red" mb="md">
            {error || 'ブログ記事が見つかりません'}
          </Alert>
          <Button component={Link} href="/blog" leftSection={<IconArrowLeft size={16} />}>
            ブログ一覧に戻る
          </Button>
        </Container>
      </BlogBackground>
    );
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

        {/* 関連記事セクション */}
        {post.relatedArticles && post.relatedArticles.length > 0 && (
          <Box mt="xl">
            <RelatedArticles articles={post.relatedArticles} />
          </Box>
        )}
      </Container>
    </BlogBackground>
  );
}