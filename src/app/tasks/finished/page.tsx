'use client';

import React, { useState, useEffect } from 'react';
import { Task, Category } from '@/lib/types';
import { formatElapsedTime } from '@/lib/utils';
import { Container, Title, Text, Paper, SimpleGrid, Group, Stack, AppShell, rem, TextInput } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import AppHeader from '@/components/AppHeader';

const FinishedTasksPage = () => {
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opened, { toggle }] = useDisclosure();
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchCompletedTasksAndCategories = async () => {
      try {
        setLoading(true);
        const [tasksRes, categoriesRes] = await Promise.all([
          fetch('/api/tasks'),
          fetch('/api/categories')
        ]);

        if (!tasksRes.ok) throw new Error(`HTTP error! status: ${tasksRes.status}`);
        if (!categoriesRes.ok) throw new Error(`HTTP error! status: ${categoriesRes.status}`);
        
        const tasks: Task[] = await tasksRes.json();
        const fetchedCategories: Category[] = await categoriesRes.json();

        setCompletedTasks(tasks.filter(task => task.completedAt));
        setCategories(fetchedCategories);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'An unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchCompletedTasksAndCategories();
  }, []);

  const totalCompletedTime = completedTasks.reduce((sum, task) => sum + task.elapsedTime, 0);
  const totalTargetTime = completedTasks.reduce((sum, task) => sum + (task.targetTime || 0), 0);

  const filteredTasks = completedTasks.filter(task =>
    task.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const groupedTasks = filteredTasks.reduce((acc, task) => {
    const date = new Date(task.completedAt!).toISOString().split('T')[0]; // YYYY-MM-DD
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(task);
    return acc;
  }, {} as Record<string, Task[]>);

  for (const date in groupedTasks) {
    groupedTasks[date].sort((a, b) => {
      const categoryA = categories.find(c => c.id === a.categoryId);
      const categoryB = categories.find(c => c.id === b.categoryId);
      const orderA = categoryA ? categoryA.order : Infinity;
      const orderB = categoryB ? categoryB.order : Infinity;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return (a.updatedAt || 0) - (b.updatedAt || 0); // Fallback sort
    });
  }

  const sortedDates = Object.keys(groupedTasks).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  return (
    <AppShell
      header={{ height: rem(60) }}
      navbar={{ width: 300, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <AppHeader onAddCategory={() => { /* No category creation on finished page */ }} />
      </AppShell.Header>

      <AppShell.Main>
        <Container size="lg" py="md">
          <Title order={1} mb="lg">完了</Title>

          <Paper shadow="sm" p="lg" withBorder mb="xl">
            <Title order={2} mb="md">統計</Title>
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
              <Stack>
                <Text size="sm" c="dimmed">完了タスク数:</Text>
                <Text size="xl" fw={700}>{completedTasks.length}</Text>
              </Stack>
              <Stack>
                <Text size="sm" c="dimmed">合計計測時間:</Text>
                <Text size="xl" fw={700}>{formatElapsedTime(totalCompletedTime)}</Text>
              </Stack>
              <Stack>
                <Text size="sm" c="dimmed">合計目標時間:</Text>
                <Text size="xl" fw={700}>{formatElapsedTime(totalTargetTime)}</Text>
              </Stack>
            </SimpleGrid>
          </Paper>

          <TextInput
            placeholder="タスク名で検索..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.currentTarget.value)}
            mb="xl"
          />

          {loading && <Text>読み込み中...</Text>}
          {error && <Text c="red">エラー: {error}</Text>}

          {!loading && !error && completedTasks.length === 0 ? (
            <Text c="dimmed">完了したタスクはありません。</Text>
          ) : !loading && !error && filteredTasks.length === 0 ? (
            <Text c="dimmed">検索条件に一致するタスクはありません。</Text>
          ) : (
            <>
              <Text mb="sm" c="dimmed">表示件数: {filteredTasks.length}件</Text>
              {sortedDates.map(date => (
                <div key={date}>
                  <Title order={2} size="h4" my="md" pb={5} style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
                    {new Date(date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </Title>
                  <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
                    {groupedTasks[date].map((task) => {
                      const completedDate = task.completedAt ? new Date(task.completedAt).toLocaleDateString('ja-JP') : 'N/A';
                      const timeDifference = task.elapsedTime - (task.targetTime || 0);
                      const timeDiffColor = timeDifference > 0 ? 'red' : 'green';

                      return (
                        <Paper key={task.id} shadow="xs" p="md" withBorder>
                          <Title order={4} mb="xs">{task.title}</Title>
                          {task.description && (
                            <Text c="dimmed" size="sm" mb="xs">{task.description}</Text>
                          )}
                          <Stack gap={4} mt="sm">
                            <Group justify="space-between">
                              <Text size="sm" c="dimmed">完了日:</Text>
                              <Text size="sm" fw={500}>{completedDate}</Text>
                            </Group>
                            <Group justify="space-between">
                              <Text size="sm" c="dimmed">計測時間:</Text>
                              <Text size="sm" fw={500}>{formatElapsedTime(task.elapsedTime)}</Text>
                            </Group>
                            <Group justify="space-between">
                              <Text size="sm" c="dimmed">目標時間:</Text>
                              <Text size="sm" fw={500}>{task.targetTime ? formatElapsedTime(task.targetTime) : 'なし'}</Text>
                            </Group>
                            <Group justify="space-between">
                              <Text size="sm" c="dimmed">差分:</Text>
                              <Text size="sm" fw={500} c={timeDiffColor}>
                                {formatElapsedTime(Math.abs(timeDifference))} {timeDifference > 0 ? '超過' : '短縮'}
                              </Text>
                            </Group>
                          </Stack>
                        </Paper>
                      );
                    })}
                  </SimpleGrid>
                </div>
              ))}
            </>
          )}
        </Container>
      </AppShell.Main>
    </AppShell>
  );
};

export default FinishedTasksPage;