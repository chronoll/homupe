'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Task, Category } from '@/lib/types';
import TaskCard from '@/components/TaskCard';
import TaskModal from '@/components/TaskModal';
import CategoryModal from '@/components/CategoryModal';
import FloatingCreateButton from '@/components/FloatingCreateButton';
import { requestNotificationPermission } from '@/lib/notifications';
import AppHeader from '@/components/AppHeader';
import { AppShell, Container, Title, Text, Paper, SimpleGrid, Stack } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { formatElapsedTime } from '@/lib/utils';

const TodayTasksPage = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Partial<Task> | undefined>(undefined);

  const fetchTasksAndCategories = useCallback(async () => {
    try {
      setLoading(true);
      const [tasksRes, categoriesRes] = await Promise.all([
        fetch('/api/tasks'),
        fetch('/api/categories'),
      ]);

      if (!tasksRes.ok) throw new Error(`Failed to fetch tasks: ${tasksRes.statusText}`);
      if (!categoriesRes.ok) throw new Error(`Failed to fetch categories: ${categoriesRes.statusText}`);

      const fetchedTasks: Task[] = await tasksRes.json();
      const fetchedCategories: Category[] = await categoriesRes.json();

      const today = new Date();
      const todayDateString = today.toISOString().split('T')[0];

      const filteredTasks = fetchedTasks.filter(task => {
        return task.deadline?.date === todayDateString && !task.completedAt;
      });

      setTasks(filteredTasks);
      setCategories(fetchedCategories);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasksAndCategories();
    requestNotificationPermission();
  }, [fetchTasksAndCategories]);

  const handleSaveTask = async (taskData: Partial<Task>) => {
    try {
      const method = taskData.id ? 'PUT' : 'POST';
      const url = taskData.id ? `/api/tasks?id=${taskData.id}` : '/api/tasks';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData),
      });
      if (!res.ok) throw new Error(`Failed to save task: ${res.statusText}`);
      fetchTasksAndCategories(); // Re-fetch to update the list
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'An unknown error occurred');
    }
  };

  const handleCompleteTask = async (taskId: string) => {
    try {
      await fetch(`/api/tasks?action=complete&id=${taskId}`, { method: 'POST' });
      setTasks(prevTasks => prevTasks.filter(task => task.id !== taskId));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'An unknown error occurred');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('本当にこのタスクを削除しますか？')) return;
    try {
      await fetch(`/api/tasks?id=${taskId}`, { method: 'DELETE' });
      setTasks(prevTasks => prevTasks.filter(task => task.id !== taskId));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'An unknown error occurred');
    }
  };

  const handleStartTimer = async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks?action=startTimer&id=${taskId}`, { method: 'POST' });
      const updatedTask: Task = await res.json();
      setTasks(prevTasks =>
        prevTasks.map(task => (task.id === taskId ? { ...task, isRunning: true, startTime: updatedTask.startTime } : task))
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'An unknown error occurred');
    }
  };

  const handleStopTimer = async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks?action=stopTimer&id=${taskId}`, { method: 'POST' });
      const updatedTask: Task = await res.json();
      setTasks(prevTasks =>
        prevTasks.map(task =>
          task.id === taskId ? { ...task, isRunning: false, elapsedTime: updatedTask.elapsedTime } : task
        )
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'An unknown error occurred');
    }
  };

  const openCreateTaskModal = () => {
    setEditingTask(undefined);
    setIsTaskModalOpen(true);
  };

  const openCreateCategoryModal = () => {
    setIsCategoryModalOpen(true);
  };

  const totalTargetTime = tasks.reduce((sum, task) => sum + (task.targetTime || 0), 0);
  const totalElapsedTime = tasks.reduce((sum, task) => sum + task.elapsedTime, 0);

  return (
    <AppShell
      header={{ height: 60 }}
      padding="md"
    >
      <AppShell.Header>
        <AppHeader onAddCategory={openCreateCategoryModal} />
      </AppShell.Header>

      <AppShell.Main>
        <Container size="lg" py="md">
          <Title order={1} mb="lg">今日のタスク</Title>

          <Paper shadow="sm" p="lg" withBorder mb="xl">
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
              <Stack align="center" gap={0}>
                <Text size="sm" c="dimmed">タスク数</Text>
                <Text size="xl" fw={700}>{tasks.length}</Text>
              </Stack>
              <Stack align="center" gap={0}>
                <Text size="sm" c="dimmed">合計計測時間</Text>
                <Text size="xl" fw={700}>{formatElapsedTime(totalElapsedTime)}</Text>
              </Stack>
              <Stack align="center" gap={0}>
                <Text size="sm" c="dimmed">合計目標時間</Text>
                <Text size="xl" fw={700}>{formatElapsedTime(totalTargetTime)}</Text>
              </Stack>
            </SimpleGrid>
          </Paper>

          {loading && <Text>読み込み中...</Text>}
          {error && <Text c="red">エラー: {error}</Text>}

          {!loading && !error && tasks.length === 0 ? (
            <Text c="dimmed">今日のタスクはありません。</Text>
          ) : (
            tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onComplete={handleCompleteTask}
                onDelete={handleDeleteTask}
                onStart={handleStartTimer}
                onStop={handleStopTimer}
                categoryName={categories.find(c => c.id === task.categoryId)?.name}
              />
            ))
          )}
        </Container>
      </AppShell.Main>

      <FloatingCreateButton onClick={openCreateTaskModal} />

      <TaskModal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        onSave={handleSaveTask}
        initialTask={editingTask}
        categories={categories}
      />

      <CategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        onSave={async (cat) => { /* Implement category save if needed */ }}
      />
    </AppShell>
  );
};

export default TodayTasksPage;