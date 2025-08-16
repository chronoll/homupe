import React from 'react';
import { Task } from '@/lib/types';
import { formatDeadline } from '@/lib/utils';
import Timer from './Timer';

interface TaskCardProps {
  task: Task;
  onComplete: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onStart: (taskId: string) => void;
  onStop: (taskId: string) => void;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragEnter?: () => void;
  onDragLeave?: () => void;
  isDragging?: boolean;
}

const TaskCard: React.FC<TaskCardProps> = React.memo(({
  task,
  onComplete,
  onDelete,
  onStart,
  onStop,
  draggable = false,
  onDragStart,
  onDragEnter,
  onDragLeave,
  isDragging = false,
}) => {
  const { text: deadlineText, className: deadlineClass } = formatDeadline(task.deadline);

  return (
    <div
      className={`bg-white rounded-lg shadow-md p-4 mb-4 border border-gray-200 ${isDragging ? 'opacity-50 border-blue-500' : ''}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
    >
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
          <p className={deadlineClass}>
            期限: {deadlineText}
          </p>
        )}
        <Timer task={task} onStart={onStart} onStop={onStop} />
      </div>
    </div>
  );
});

TaskCard.displayName = 'TaskCard';

export default React.memo(TaskCard);