import React, { useState, useEffect, useRef } from 'react';
import { Task } from '@/lib/types';
import { formatDeadline, formatElapsedTime } from '@/lib/utils';
import { showNotification } from '@/lib/notifications';
import { Card, Group, Text, Button, Stack } from '@mantine/core';

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

  // Timer logic from Timer.tsx
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
          notificationSentRef.current = false;
        }
      }, 1000);
    } else {
      setDisplayTime(task.elapsedTime);
      if (task.targetTime && task.elapsedTime > task.targetTime) {
        setIsOverTarget(true);
      } else {
        setIsOverTarget(false);
      }
      notificationSentRef.current = false;
    }

    return () => clearInterval(interval);
  }, [task.isRunning, task.elapsedTime, task.startTime, task.targetTime, task.title]);

  const timeColor = isOverTarget ? 'red' : 'gray';

  return (
    <Card
      shadow="sm"
      padding="lg"
      radius="md"
      withBorder
      mb="md"
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      style={{ opacity: isDragging ? 0.5 : 1, borderColor: isDragging ? 'var(--mantine-color-blue-5)' : undefined }}
    >
      <Stack gap="xs">
        {/* Top Section: Title and Description */}
        <Stack gap={0} mb="md">
            <Text fw={500} size="lg">{task.title}</Text>
            {task.description && (
                <Text c="dimmed" size="sm">{task.description}</Text>
            )}
        </Stack>

        {/* Middle Section: Timers and Controls */}
        <Group justify="space-between" align="center">
          <Group gap="md" align="center">
            {task.targetTime && (
              <Stack gap={0}>
                <Text size="xs" c="dimmed">目標</Text>
                <Text size="lg" c="dimmed">{formatElapsedTime(task.targetTime)}</Text>
              </Stack>
            )}
            <Stack gap={0}>
              <Text size="xs" c="dimmed">計測</Text>
              <Text size="lg" c={timeColor} fw={isOverTarget ? 700 : 400}>
                {formatElapsedTime(displayTime)}
              </Text>
            </Stack>
          </Group>

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

        {/* Bottom Section: Deadline and Actions */}
        <Group justify="space-between" align="center" mt="sm">
            {task.deadline && (
                <Text size="sm" className={deadlineClass}>
                期限: {deadlineText}
                </Text>
            )}
            <Group justify="flex-end" gap="xs" style={{ flexGrow: 1}}>
                <Button variant="light" color="green" size="xs" onClick={() => onComplete(task.id)}>
                    完了
                </Button>
                <Button variant="light" color="red" size="xs" onClick={() => onDelete(task.id)}>
                    削除
                </Button>
            </Group>
        </Group>
      </Stack>
    </Card>
  );
});

TaskCard.displayName = 'TaskCard';

export default React.memo(TaskCard);