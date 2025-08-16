
'use client';

import React from 'react';
import { Group, Title, Button, rem } from '@mantine/core';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface AppHeaderProps {
  onAddCategory: () => void;
}

const AppHeader: React.FC<AppHeaderProps> = React.memo(({
  onAddCategory,
}) => {
  const pathname = usePathname();

  return (
    <Group h="100%" px="md">
      <Title order={1} size="h3">タスク管理</Title>
      <Group ml="auto" gap="md">
        <Link href="/tasks" passHref>
          <Button variant={pathname === '/tasks' ? 'filled' : 'light'}>
            アクティブタスク
          </Button>
        </Link>
        <Link href="/tasks/finished" passHref>
          <Button variant={pathname === '/tasks/finished' ? 'filled' : 'light'}>
            完了タスク
          </Button>
        </Link>
        <Button onClick={onAddCategory}>+ カテゴリ作成</Button>
      </Group>
    </Group>
  );
});

AppHeader.displayName = 'AppHeader';

export default AppHeader;
