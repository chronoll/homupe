
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Task, Category } from '@/lib/types';
import CategorySection from '@/components/CategorySection';
import TaskModal from '@/components/TaskModal';
import CategoryModal from '@/components/CategoryModal';
import FloatingCreateButton from '@/components/FloatingCreateButton';
import { requestNotificationPermission } from '@/lib/notifications';

import AppHeader from '@/components/AppHeader';

import { AppShell, Burger, Group, Title, Button, Container, Text, rem } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';

const TasksPage = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Partial<Task> | undefined>(undefined);
  const [selectedCategoryIdForNewTask, setSelectedCategoryIdForNewTask] = useState<string | undefined>(undefined);
  const [opened, { toggle }] = useDisclosure();

  const uncategorizedTasks = tasks.filter(task => !task.categoryId);
  const categorizedTasks = categories.map(category => ({
    category,
    tasks: tasks.filter(task => task.categoryId === category.id),
  }));

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

      // Sort tasks by deadline, then by order
      fetchedTasks.sort((a, b) => {
        const deadlineA = a.deadline?.date ? new Date(a.deadline.date + (a.deadline.time || '')).getTime() : Infinity;
        const deadlineB = b.deadline?.date ? new Date(b.deadline.date + (b.deadline.time || '')).getTime() : Infinity;

        if (deadlineA !== deadlineB) {
          return deadlineA - deadlineB;
        }
        return (a.order || 0) - (b.order || 0);
      });

      setTasks(fetchedTasks.filter(task => !task.completedAt)); // Only show active tasks
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

      const savedTask: Task = await res.json();

      setTasks(prevTasks => {
        if (taskData.id) {
          // Update existing task
          return prevTasks.map(task => (task.id === savedTask.id ? savedTask : task));
        } else {
          // Add new task
          return [...prevTasks, savedTask];
        }
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'An unknown error occurred');
    }
  };

  const handleCompleteTask = async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks?action=complete&id=${taskId}`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`Failed to complete task: ${res.statusText}`);
      
      // Optimistically update UI
      setTasks(prevTasks => prevTasks.filter(task => task.id !== taskId));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'An unknown error occurred');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('本当にこのタスクを削除しますか？')) return;
    try {
      const res = await fetch(`/api/tasks?id=${taskId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`Failed to delete task: ${res.statusText}`);
      
      // Optimistically update UI
      setTasks(prevTasks => prevTasks.filter(task => task.id !== taskId));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'An unknown error occurred');
    }
  };

  const handleStartTimer = async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks?action=startTimer&id=${taskId}`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`Failed to start timer: ${res.statusText}`);
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
      const res = await fetch(`/api/tasks?action=stopTimer&id=${taskId}`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`Failed to stop timer: ${res.statusText}`);
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

  const handleReorderTasks = async (taskIds: string[], categoryId?: string) => {
    try {
      // Optimistic update
      setTasks(prevTasks => {
        const reordered = taskIds.map(id => prevTasks.find(t => t.id === id)!);
        const otherTasks = prevTasks.filter(t => !taskIds.includes(t.id));
        return [...reordered, ...otherTasks];
      });

      const res = await fetch('/api/tasks?action=reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskIds, categoryId }),
      });
      if (!res.ok) throw new Error(`Failed to reorder tasks: ${res.statusText}`);
      // No need to fetchTasksAndCategories();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'An unknown error occurred');
      // Revert on error - re-fetch to ensure consistency
      fetchTasksAndCategories();
    }
  };

  const handleSaveCategory = async (categoryData: Partial<Category>) => {
    try {
      const method = categoryData.id ? 'PUT' : 'POST';
      const url = categoryData.id ? `/api/categories?id=${categoryData.id}` : '/api/categories';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(categoryData),
      });
      if (!res.ok) throw new Error(`Failed to save category: ${res.statusText}`);
      
      const savedCategory: Category = await res.json();

      setCategories(prevCategories => {
        if (categoryData.id) {
          // Update existing category
          return prevCategories.map(category => (category.id === savedCategory.id ? savedCategory : category));
        } else {
          // Add new category
          return [...prevCategories, savedCategory];
        }
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'An unknown error occurred');
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!confirm('本当にこのカテゴリを削除しますか？関連するタスクは未分類になります。')) return;
    try {
      const res = await fetch(`/api/categories?id=${categoryId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`Failed to delete category: ${res.statusText}`);
      
      // Update categories state
      setCategories(prevCategories => prevCategories.filter(cat => cat.id !== categoryId));
      // Update tasks state: set categoryId to undefined for tasks in this category
      setTasks(prevTasks =>
        prevTasks.map(task =>
          task.categoryId === categoryId ? { ...task, categoryId: undefined } : task
        )
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'An unknown error occurred');
    }
  };

  const openCreateTaskModal = (categoryId?: string) => {
    setEditingTask(undefined);
    setSelectedCategoryIdForNewTask(categoryId);
    setIsTaskModalOpen(true);
  };

  const openEditTaskModal = (task: Task) => {
    setEditingTask(task);
    setIsTaskModalOpen(true);
  };

  const openCreateCategoryModal = () => {
    setIsCategoryModalOpen(true);
  };

  return (
    <AppShell
      header={{ height: rem(60) }}
      navbar={{ width: 300, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <AppHeader onAddCategory={openCreateCategoryModal} />
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <Title order={2} size="h4" mb="md">カテゴリ</Title>
        {categories.map(cat => (
          <Group key={cat.id} justify="space-between" mb="xs">
            <Text>{cat.name}</Text>
            <Button size="xs" variant="light" onClick={() => handleDeleteCategory(cat.id)}>削除</Button>
          </Group>
        ))}
      </AppShell.Navbar>

      <AppShell.Main>
        <Container size="lg">
          {loading && <Text>読み込み中...</Text>}
          {error && <Text color="red">エラー: {error}</Text>}

          {!loading && !error && (
            <>
              {categorizedTasks.map(({ category, tasks: catTasks }) => (
                <CategorySection
                  key={category.id}
                  category={category}
                  tasks={catTasks}
                  onCompleteTask={handleCompleteTask}
                  onDeleteTask={handleDeleteTask}
                  onStartTimer={handleStartTimer}
                  onStopTimer={handleStopTimer}
                  onCreateTask={openCreateTaskModal}
                  onReorderTasks={handleReorderTasks}
                />
              ))}
              {uncategorizedTasks.length > 0 && (
                <CategorySection
                  tasks={uncategorizedTasks}
                  onCompleteTask={handleCompleteTask}
                  onDeleteTask={handleDeleteTask}
                  onStartTimer={handleStartTimer}
                  onStopTimer={handleStopTimer}
                  onCreateTask={openCreateTaskModal}
                  onReorderTasks={handleReorderTasks}
                />
              )}
            </>
          )}
        </Container>
      </AppShell.Main>

      <FloatingCreateButton onClick={() => openCreateTaskModal()} />

      <TaskModal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        onSave={handleSaveTask}
        initialTask={editingTask || (selectedCategoryIdForNewTask ? { categoryId: selectedCategoryIdForNewTask } : undefined)}
        categories={categories}
      />

      <CategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        onSave={handleSaveCategory}
      />
    </AppShell>
  );
};

export default TasksPage;
