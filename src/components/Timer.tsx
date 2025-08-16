import React, { useState, useEffect, useRef } from 'react';
import { Task } from '@/lib/types';
import { formatElapsedTime } from '@/lib/utils';
import { showNotification } from '@/lib/notifications';

interface TimerProps {
  task: Task;
  onStart: (taskId: string) => void;
  onStop: (taskId: string) => void;
}

const Timer: React.FC<TimerProps> = React.memo(({
  task,
  onStart,
  onStop,
}) => {
  const [displayTime, setDisplayTime] = useState(task.elapsedTime);
  const [isOverTarget, setIsOverTarget] = useState(false);
  const notificationSentRef = useRef(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (task.isRunning) {
      interval = setInterval(() => {
        const now = Date.now();
        const elapsedSinceStart = (now - (task.startTime || now)) / (1000 * 60); // minutes
        const currentTotalElapsed = task.elapsedTime + elapsedSinceStart;
        setDisplayTime(currentTotalElapsed);

        if (task.targetTime && currentTotalElapsed > task.targetTime) {
          setIsOverTarget(true);
          if (!notificationSentRef.current) {
            showNotification(
              `時間超過: ${task.title}`,
              {
                body: `目標時間を${formatElapsedTime(currentTotalElapsed - task.targetTime)}超過しました！`,
                icon: '/retro-heart.svg',
              }
            );
            notificationSentRef.current = true;
          }
        } else {
          setIsOverTarget(false);
          notificationSentRef.current = false; // Reset when no longer over target
        }
      }, 1000);
    } else {
      setDisplayTime(task.elapsedTime);
      if (task.targetTime && task.elapsedTime > task.targetTime) {
        setIsOverTarget(true);
      } else {
        setIsOverTarget(false);
      }
      notificationSentRef.current = false; // Reset when timer stops
    }

    return () => clearInterval(interval);
  }, [task.isRunning, task.elapsedTime, task.startTime, task.targetTime, task.title]);

  const timeColorClass = isOverTarget ? 'text-red-600 font-bold' : 'text-gray-800';

  return (
    <div className="flex items-center space-x-2">
      <span className={`text-lg ${timeColorClass}`}>
        {formatElapsedTime(displayTime)}
      </span>
      {!task.isRunning ? (
        <button
          onClick={() => onStart(task.id)}
          className="bg-blue-500 hover:bg-blue-600 text-white text-sm px-3 py-1 rounded-full transition-colors duration-200"
        >
          開始
        </button>
      ) : (
        <button
          onClick={() => onStop(task.id)}
          className="bg-yellow-500 hover:bg-yellow-600 text-white text-sm px-3 py-1 rounded-full transition-colors duration-200"
        >
          停止
        </button>
      )}
    </div>
  );
});

Timer.displayName = 'Timer';

export default React.memo(Timer);