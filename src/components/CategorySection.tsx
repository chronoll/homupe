import React, { useState, useEffect } from 'react';
import { Task, Category } from '@/lib/types';
import TaskCard from './TaskCard';
import { Title, Button, Paper, Text, Group, Stack } from '@mantine/core';
import { formatElapsedTime } from '@/lib/utils';

interface CategorySectionProps {
  category?: Category; // Undefined for uncategorized tasks
  tasks: Task[];
  onCompleteTask: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onStartTimer: (taskId: string) => void;
  onStopTimer: (taskId: string) => void;
  onCreateTask: (categoryId?: string) => void; // Function to open task creation modal
  onReorderTasks: (taskIds: string[], categoryId?: string) => void; // New prop for reordering
  totalTargetTime: number;
  totalElapsedTime: number;
}

const CategorySection: React.FC<CategorySectionProps> = React.memo(({
  category,
  tasks,
  onCompleteTask,
  onDeleteTask,
  onStartTimer,
  onStopTimer,
  onCreateTask,
  onReorderTasks,
  totalTargetTime,
  totalElapsedTime,
}) => {
  const [localTasks, setLocalTasks] = useState<Task[]>(tasks);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  useEffect(() => {
    setLocalTasks(tasks);
  }, [tasks]);

  const categoryName = category ? category.name : '未分類';

  const handleDragStart = (id: string) => {
    setDraggingId(id);
  };

  const handleDragEnter = (id: string) => {
    if (id === draggingId) return;

    const newTasks = [...localTasks];
    const draggingIndex = newTasks.findIndex((task) => task.id === draggingId);
    const targetIndex = newTasks.findIndex((task) => task.id === id);

    if (draggingIndex !== -1 && targetIndex !== -1) {
      const [removed] = newTasks.splice(draggingIndex, 1);
      newTasks.splice(targetIndex, 0, removed);
      setLocalTasks(newTasks);
    }
  };

  const handleDragLeave = () => {
    // Optional: Add visual feedback for drag leave if needed
  };

  const handleDrop = () => {
    if (draggingId === null) return;
    onReorderTasks(localTasks.map((task) => task.id), category?.id);
    setDraggingId(null);
  };

  return (
    <Paper shadow="xs" p="md" withBorder mb="lg">
      <Group justify="space-between" mb="md">
        <Title order={3}>{categoryName}</Title>
        <Button onClick={() => onCreateTask(category?.id)} variant="light">
          + タスク追加
        </Button>
      </Group>
      {tasks.length === 0 ? (
        <Text c="dimmed">このカテゴリにはタスクがありません。</Text>
      ) : (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          style={{ minHeight: '50px' }}
        >
          {localTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onComplete={onCompleteTask}
              onDelete={onDeleteTask}
              onStart={onStartTimer}
              onStop={onStopTimer}
              draggable
              onDragStart={() => handleDragStart(task.id)}
              onDragEnter={() => handleDragEnter(task.id)}
              onDragLeave={handleDragLeave}
              isDragging={draggingId === task.id}
            />
          ))}
        </div>
      )}
      {tasks.length > 0 && (
        <Group justify="flex-end" mt="md" pt="md" style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
          <Stack gap={0} align="flex-end">
            <Text size="sm" c="dimmed">カテゴリ合計</Text>
            <Text>計測: {formatElapsedTime(totalElapsedTime)}</Text>
            <Text>目標: {formatElapsedTime(totalTargetTime)}</Text>
          </Stack>
        </Group>
      )}
    </Paper>
  );
});

CategorySection.displayName = 'CategorySection';

export default React.memo(CategorySection);