'use client';

import React from 'react';
import { Group, Title, Button, rem, Avatar, Text } from '@mantine/core';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signIn, signOut } from 'next-auth/react';

interface AppHeaderProps {
  onAddCategory: () => void;
}

const AppHeader: React.FC<AppHeaderProps> = React.memo(({
  onAddCategory,
}) => {
  const pathname = usePathname();
  const { data: session, status } = useSession();

  return (
    <Group h="100%" px="md">
      <Title order={1} size="h3">タスク管理</Title>
      <Group ml="auto" gap="md">
        <Link href="/tasks/today" passHref>
          <Button variant={pathname === '/tasks/today' ? 'filled' : 'light'}>
            今日
          </Button>
        </Link>
        <Link href="/tasks" passHref>
          <Button variant={pathname === '/tasks' ? 'filled' : 'light'}>
            カテゴリ別
          </Button>
        </Link>
        <Link href="/tasks/finished" passHref>
          <Button variant={pathname === '/tasks/finished' ? 'filled' : 'light'}>
            完了
          </Button>
        </Link>
        <Button onClick={onAddCategory}>+ カテゴリ作成</Button>
      </Group>
      <Group gap="xs">
        {status === 'authenticated' ? (
          <>
            <Avatar src={session.user?.image} alt={session.user?.name ?? 'User'} radius="xl" />
            <Text size="sm" fw={500}>
              {session.user?.name}
            </Text>
            <Button variant="light" onClick={() => signOut()}>
              ログアウト
            </Button>
          </>
        ) : (
          <Button onClick={() => signIn('google')}>
            Googleでログイン
          </Button>
        )}
      </Group>
    </Group>
  );
});

AppHeader.displayName = 'AppHeader';

export default AppHeader;