import React, { useState, useEffect } from 'react';
import { Task, Category } from '@/lib/types';
import TaskCard from './TaskCard';

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
    <div className="bg-gray-100 rounded-lg p-4 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-800">{categoryName}</h2>
        <button
          onClick={() => onCreateTask(category?.id)}
          className="bg-blue-500 hover:bg-blue-600 text-white text-sm px-4 py-2 rounded-full transition-colors duration-200"
        >
          + タスク追加
        </button>
      </div>
      {tasks.length === 0 ? (
        <p className="text-gray-600">このカテゴリにはタスクがありません。</p>
      ) : (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="min-h-[50px]"
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
    </div>
  );
});

CategorySection.displayName = 'CategorySection';

export default React.memo(CategorySection);