'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Task, Category } from '@/lib/types';
import CategorySection from '@/components/CategorySection';
import TaskModal from '@/components/TaskModal';
import CategoryModal from '@/components/CategoryModal';
import FloatingCreateButton from '@/components/FloatingCreateButton';
import { requestNotificationPermission } from '@/lib/notifications';

const TasksPage = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Partial<Task> | undefined>(undefined);
  const [selectedCategoryIdForNewTask, setSelectedCategoryIdForNewTask] = useState<string | undefined>(undefined);

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
      fetchTasksAndCategories();
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
      fetchTasksAndCategories();
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
      fetchTasksAndCategories();
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
      fetchTasksAndCategories();
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
      fetchTasksAndCategories();
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
      // Re-fetch to ensure consistency after optimistic update
      fetchTasksAndCategories();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'An unknown error occurred');
      fetchTasksAndCategories(); // Revert on error
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
      fetchTasksAndCategories();
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
      fetchTasksAndCategories();
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

  if (loading) {
    return <div className="container mx-auto p-4">読み込み中...</div>;
  }

  if (error) {
    return <div className="container mx-auto p-4 text-red-600">エラー: {error}</div>;
  }

  const uncategorizedTasks = tasks.filter(task => !task.categoryId);
  const categorizedTasks = categories.map(category => ({
    category,
    tasks: tasks.filter(task => task.categoryId === category.id),
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">タスク管理</h1>
          <button
            onClick={openCreateCategoryModal}
            className="bg-purple-500 hover:bg-purple-600 text-white text-sm px-4 py-2 rounded-full transition-colors duration-200"
          >
            + カテゴリ作成
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Uncategorized Tasks */}
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

        {/* Categorized Tasks */}
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
      </main>

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
    </div>
  );
};

export default TasksPage;