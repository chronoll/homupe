import { Container, Title, Text, Button, Stack } from '@mantine/core';
import { IconArrowLeft, IconFileX } from '@tabler/icons-react';
import Link from 'next/link';
import BlogBackground from '@/components/BlogBackground';

export default function NotFound() {
  return (
    <BlogBackground>
      <Container size="md" py="xl">
        <Stack align="center" gap="xl" style={{ minHeight: '60vh', justifyContent: 'center' }}>
          <IconFileX size={80} color="white" style={{ opacity: 0.7 }} />
          
          <Stack align="center" gap="md">
            <Title order={1} c="white" ta="center">
              ページが見つかりません
            </Title>
            <Text size="lg" c="white" ta="center" style={{ opacity: 0.8 }}>
              お探しのブログ記事は存在しないか、まだ公開されていません。
            </Text>
          </Stack>

          <Button
            component={Link}
            href="/blog"
            leftSection={<IconArrowLeft size={16} />}
            size="lg"
            variant="light"
            c="white"
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
            }}
          >
            ブログ一覧に戻る
          </Button>
        </Stack>
      </Container>
    </BlogBackground>
  );
}