
import React, { useState, useEffect, useRef } from 'react';
import { Task } from '@/lib/types';
import { formatElapsedTime } from '@/lib/utils';
import { showNotification } from '@/lib/notifications';
import { Group, Text, Button } from '@mantine/core';

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

  const timeColor = isOverTarget ? 'red' : 'gray';

  return (
    <Group gap="xs">
      <Text size="lg" c={timeColor} fw={isOverTarget ? 700 : 400}>
        {formatElapsedTime(displayTime)}
      </Text>
      {!task.isRunning ? (
        <Button size="xs" variant="light" color="blue" onClick={() => onStart(task.id)}>
          開始
        </Button>
      ) : (
        <Button size="xs" variant="light" color="yellow" onClick={() => onStop(task.id)}>
          停止
        </Button>
      )}
    </Group>
  );
});

Timer.displayName = 'Timer';

export default React.memo(Timer);
