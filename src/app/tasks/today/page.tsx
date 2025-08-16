
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Task, Category } from '@/lib/types';
import TaskCard from '@/components/TaskCard';
import TaskModal from '@/components/TaskModal';
import CategoryModal from '@/components/CategoryModal';
import FloatingCreateButton from '@/components/FloatingCreateButton';
import { requestNotificationPermission } from '@/lib/notifications';
import AppHeader from '@/components/AppHeader';
import { AppShell, Container, Title, Text, Paper, Stack, Grid, Group, TextInput } from '@mantine/core';
import { formatElapsedTime, formatWorkTime } from '@/lib/utils';

const TodayTasksPage = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Partial<Task> | undefined>(undefined);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const [workTime, setWorkTime] = useState(0);
  const [isEditingWorkTime, setIsEditingWorkTime] = useState(false);
  const [workTimeInput, setWorkTimeInput] = useState("00:00");

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
      today.setHours(23, 59, 59, 999);

      const filteredTasks = fetchedTasks.filter(task => {
        if (!task.deadline?.date || task.completedAt) return false;
        const deadlineDate = new Date(task.deadline.date);
        return deadlineDate <= today;
      });

      filteredTasks.sort((a, b) => {
        const deadlineA = a.deadline?.date ? new Date(a.deadline.date + (a.deadline.time || '')).getTime() : Infinity;
        const deadlineB = b.deadline?.date ? new Date(b.deadline.date + (b.deadline.time || '')).getTime() : Infinity;
        if (deadlineA !== deadlineB) return deadlineA - deadlineB;
        return (a.order || 0) - (b.order || 0);
      });

      setTasks(filteredTasks);
      setCategories(fetchedCategories);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchWorkTime = useCallback(async () => {
    try {
      const res = await fetch('/api/work-time');
      if (!res.ok) throw new Error('Failed to fetch work time');
      const data = await res.json();
      setWorkTime(data.minutes);
      setWorkTimeInput(formatWorkTime(data.minutes));
    } catch (e) {
      console.error("Failed to fetch work time", e);
      setError(e instanceof Error ? e.message : 'Failed to load work time');
    }
  }, []);

  useEffect(() => {
    fetchTasksAndCategories();
    fetchWorkTime();
    requestNotificationPermission();
  }, [fetchTasksAndCategories, fetchWorkTime]);

  const handleReorderTasks = async (taskIds: string[]) => {
    const originalTasks = [...tasks];
    const reorderedTasks = taskIds.map(id => tasks.find(t => t.id === id)!);
    const otherTasks = tasks.filter(t => !taskIds.includes(t.id));
    const newTasks = [...reorderedTasks, ...otherTasks];
    setTasks(newTasks);

    try {
      const res = await fetch('/api/tasks?action=reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskIds }),
      });
      if (!res.ok) throw new Error(`Failed to reorder tasks: ${res.statusText}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'An unknown error occurred');
      setTasks(originalTasks);
    }
  };

  const handleDragStart = (id: string) => {
    setDraggingId(id);
  };

  const handleDragEnter = (targetId: string) => {
    if (draggingId === null || draggingId === targetId) return;

    const draggingTask = tasks.find(t => t.id === draggingId);
    const targetTask = tasks.find(t => t.id === targetId);

    if (draggingTask?.deadline?.date !== targetTask?.deadline?.date || draggingTask?.deadline?.time !== targetTask?.deadline?.time) {
        return;
    }

    const newTasks = [...tasks];
    const draggingIndex = newTasks.findIndex((task) => task.id === draggingId);
    const targetIndex = newTasks.findIndex((task) => task.id === targetId);

    if (draggingIndex !== -1 && targetIndex !== -1) {
      const [removed] = newTasks.splice(draggingIndex, 1);
      newTasks.splice(targetIndex, 0, removed);
      setTasks(newTasks);
    }
  };

  const handleDrop = () => {
    if (draggingId === null) return;
    handleReorderTasks(tasks.map(t => t.id));
    setDraggingId(null);
  };

  const handleSaveWorkTime = async () => {
    const parts = workTimeInput.split(':').map(p => parseInt(p, 10));
    let minutes = 0;
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      minutes = parts[0] * 60 + parts[1];
    } else if (parts.length === 1 && !isNaN(parts[0])) {
      minutes = parts[0];
    } else {
        setWorkTimeInput(formatWorkTime(workTime));
        setIsEditingWorkTime(false);
        return;
    }
    
    try {
      await fetch('/api/work-time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes }),
      });
      setWorkTime(minutes);
      setWorkTimeInput(formatWorkTime(minutes));
    } catch (e) {
      console.error("Failed to save work time", e);
      setError(e instanceof Error ? e.message : 'Failed to save work time');
    } finally {
      setIsEditingWorkTime(false);
    }
  };

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
      fetchTasksAndCategories();
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

  const openEditTaskModal = (task: Task) => {
    setEditingTask(task);
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
            <Grid align="center">
              <Grid.Col span="auto">
                <Stack align="center" gap={0}>
                    <Text size="sm" c="dimmed">タスク数</Text>
                    <Text size="xl" fw={700}>{tasks.length}</Text>
                </Stack>
              </Grid.Col>
              <Grid.Col span="content">
                <Group gap="md">
                    <Stack gap={0} align="end">
                        <Text size="xs" c="dimmed">作業時間</Text>
                        {isEditingWorkTime ? (
                          <TextInput
                            size="xs"
                            value={workTimeInput}
                            onChange={(event) => setWorkTimeInput(event.currentTarget.value)}
                            onBlur={handleSaveWorkTime}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') handleSaveWorkTime();
                              if (event.key === 'Escape') {
                                setIsEditingWorkTime(false);
                                setWorkTimeInput(formatWorkTime(workTime));
                              }
                            }}
                            autoFocus
                            style={{ width: '70px' }}
                          />
                        ) : (
                          <Text size="lg" onClick={() => setIsEditingWorkTime(true)} style={{ cursor: 'pointer' }}>
                            {formatWorkTime(workTime)}
                          </Text>
                        )}
                    </Stack>
                    <Stack gap={0} align="end">
                        <Text size="xs" c="dimmed">合計目標</Text>
                        <Text size="lg" c="dimmed">{formatElapsedTime(totalTargetTime)}</Text>
                    </Stack>
                    <Stack gap={0} align="end">
                        <Text size="xs" c="dimmed">合計計測</Text>
                        <Text size="lg">{formatElapsedTime(totalElapsedTime)}</Text>
                    </Stack>
                    <div style={{ width: '60px' }} /> 
                </Group>
              </Grid.Col>
            </Grid>
          </Paper>

          {loading && <Text>読み込み中...</Text>}
          {error && <Text c="red">エラー: {error}</Text>}

          {!loading && !error && tasks.length === 0 ? (
            <Text c="dimmed">対象のタスクはありません。</Text>
          ) : (
            <div onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
              {tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onComplete={handleCompleteTask}
                  onDelete={handleDeleteTask}
                  onStart={handleStartTimer}
                  onStop={handleStopTimer}
                  categoryName={categories.find(c => c.id === task.categoryId)?.name}
                  draggable
                  onDragStart={() => handleDragStart(task.id)}
                  onDragEnter={() => handleDragEnter(task.id)}
                  isDragging={draggingId === task.id}
                  onEdit={openEditTaskModal}
                />
              ))}
            </div>
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
