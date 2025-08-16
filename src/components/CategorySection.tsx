
import React from 'react';
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
}

const CategorySection: React.FC<CategorySectionProps> = ({
  category,
  tasks,
  onCompleteTask,
  onDeleteTask,
  onStartTimer,
  onStopTimer,
  onCreateTask,
}) => {
  const categoryName = category ? category.name : '未分類';

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
        <div>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onComplete={onCompleteTask}
              onDelete={onDeleteTask}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default CategorySection;
