
import React from 'react';
import { Task } from '@/lib/types';
import { formatDeadline, formatElapsedTime } from '@/lib/utils';

interface TaskCardProps {
  task: Task;
  onComplete: (taskId: string) => void;
  onDelete: (taskId: string) => void;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, onComplete, onDelete }) => {
  const isOverdue = task.deadline && new Date(task.deadline.date).getTime() < Date.now();

  return (
    <div className="bg-white rounded-lg shadow-md p-4 mb-4 border border-gray-200">
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-lg font-semibold text-gray-800">{task.title}</h3>
        <div className="flex space-x-2">
          <button
            onClick={() => onComplete(task.id)}
            className="bg-green-500 hover:bg-green-600 text-white text-sm px-3 py-1 rounded-full transition-colors duration-200"
          >
            完了
          </button>
          <button
            onClick={() => onDelete(task.id)}
            className="bg-red-500 hover:bg-red-600 text-white text-sm px-3 py-1 rounded-full transition-colors duration-200"
          >
            削除
          </button>
        </div>
      </div>
      {task.description && (
        <p className="text-gray-600 text-sm mb-2">{task.description}</p>
      )}
      <div className="text-sm text-gray-500">
        {task.deadline && (
          <p className={isOverdue ? 'text-red-600 font-medium' : ''}>
            期限: {formatDeadline(task.deadline)}
            {isOverdue && <span className="ml-1">(期限切れ)</span>}
          </p>
        )}
        <p>経過時間: {formatElapsedTime(task.elapsedTime)}</p>
      </div>
    </div>
  );
};

export default TaskCard;
