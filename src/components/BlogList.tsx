'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Container, Title, Card, Text, Badge, Group, Stack, Tabs } from '@mantine/core';
import { IconCalendar } from '@tabler/icons-react';
import BlogBackground from '@/components/BlogBackground';
import { BlogPost } from '@/lib/notion';

const KNOWN_CATEGORIES = ['一般', 'テック'] as const;

type TabValue = 'all' | '一般' | 'テック' | 'その他';

interface BlogListProps {
  posts: BlogPost[];
}

export default function BlogList({ posts }: BlogListProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabValue>('all');

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const isKnownCategory = (category: string): boolean =>
    (KNOWN_CATEGORIES as readonly string[]).includes(category);

  const filteredPosts = posts.filter((post) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'その他') return !isKnownCategory(post.category);
    return post.category === activeTab;
  });

  const counts = {
    all: posts.length,
    '一般': posts.filter((p) => p.category === '一般').length,
    'テック': posts.filter((p) => p.category === 'テック').length,
    'その他': posts.filter((p) => !isKnownCategory(p.category)).length,
  };

  return (
    <BlogBackground>
      <Container size="lg" py="xl">
        <Title order={1} mb="xl" c="white">Blog</Title>

        <Tabs
          value={activeTab}
          onChange={(value) => setActiveTab((value ?? 'all') as TabValue)}
          mb="md"
          styles={{
            list: {
              borderBottom: '2px solid rgba(255, 255, 255, 0.2)',
              flexWrap: 'wrap',
              gap: '4px',
            },
            tab: {
              color: 'rgba(255, 255, 255, 0.7)',
              fontWeight: 500,
              '&[data-active]': {
                color: 'white',
                borderColor: 'white',
              },
              '&:hover': {
                color: 'white',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
              },
            },
          }}
        >
          <Tabs.List>
            <Tabs.Tab value="all">すべて ({counts.all})</Tabs.Tab>
            <Tabs.Tab value="一般">一般 ({counts['一般']})</Tabs.Tab>
            <Tabs.Tab value="テック">テック ({counts['テック']})</Tabs.Tab>
            {counts['その他'] > 0 && (
              <Tabs.Tab value="その他">その他 ({counts['その他']})</Tabs.Tab>
            )}
          </Tabs.List>
        </Tabs>

        <Stack
          gap="md"
          style={{
            transition: 'opacity 0.2s ease',
          }}
        >
          {filteredPosts.length === 0 ? (
            <Text c="white">この分類のブログ記事はありません。</Text>
          ) : (
            filteredPosts.map((post) => (
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
