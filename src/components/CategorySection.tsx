
import React, { useState, useEffect } from 'react';
import { Task, Category } from '@/lib/types';
import TaskCard from './TaskCard';
import { Title, Button, Paper, Text, Group } from '@mantine/core';

interface CategorySectionProps {
  category?: Category; // Undefined for uncategorized tasks
  tasks: Task[];
  onCompleteTask: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onStartTimer: (taskId: string) => void;
  onStopTimer: (taskId: string) => void;
  onCreateTask: (categoryId?: string) => void; // Function to open task creation modal
  onReorderTasks: (taskIds: string[], categoryId?: string) => void; // New prop for reordering
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
    </Paper>
  );
});

CategorySection.displayName = 'CategorySection';

export default React.memo(CategorySection);
