'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Container, Title, Group, Badge, Text, Loader, Alert, Button, Box } from '@mantine/core';
import { IconArrowLeft, IconCalendar, IconAlertCircle } from '@tabler/icons-react';
import Link from 'next/link';
import NotionBlockRenderer from '@/components/NotionBlockRenderer';
import { BlockObjectResponse } from '@notionhq/client/build/src/api-endpoints';

interface BlogPost {
  id: string;
  title: string;
  date: string;
  tags: string[];
  category: string;
  blocks: BlockObjectResponse[];
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
      if (!response.ok) {
        throw new Error('Failed to fetch blog post');
      }
      const data = await response.json();
      setPost(data);
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
      <Container size="md" py="xl">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
          <Loader size="lg" />
        </div>
      </Container>
    );
  }

  if (error || !post) {
    return (
      <Container size="md" py="xl">
        <Alert icon={<IconAlertCircle size="1rem" />} title="エラー" color="red" mb="md">
          {error || 'ブログ記事が見つかりません'}
        </Alert>
        <Button component={Link} href="/blog" leftSection={<IconArrowLeft size={16} />}>
          ブログ一覧に戻る
        </Button>
      </Container>
    );
  }

  return (
    <Container size="md" py="xl">
      <Button 
        component={Link} 
        href="/blog" 
        variant="subtle" 
        leftSection={<IconArrowLeft size={16} />}
        mb="xl"
      >
        ブログ一覧に戻る
      </Button>

      <Box mb="xl">
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

      <Box>
        <NotionBlockRenderer blocks={post.blocks} />
      </Box>
    </Container>
  );
}