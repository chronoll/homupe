import React, { useState, useEffect, useRef } from 'react';
import { Task } from '@/lib/types';
import { formatDeadline, formatElapsedTime } from '@/lib/utils';
import { showNotification } from '@/lib/notifications';
import { Card, Group, Text, Button, Stack, Grid } from '@mantine/core';

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
  categoryName?: string;
  onEdit: (task: Task) => void;
  onResetTimer?: (taskId: string) => void;
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
  categoryName,
  onEdit,
  onResetTimer,
}) => {
  const { text: deadlineText, color: deadlineColor, fontWeight: deadlineFontWeight } = formatDeadline(task.deadline);

  const [displayTime, setDisplayTime] = useState(task.elapsedTime);
  const [isOverTarget, setIsOverTarget] = useState(false);
  const [estimatedEndTime, setEstimatedEndTime] = useState<Date | null>(null);
  const notificationSentRef = useRef(false);

  useEffect(() => {
    let interval: NodeJS.Timeout | undefined = undefined;

    if (task.isRunning) {
      if (task.startTime && task.targetTime) {
        const remainingTimeMs = (task.targetTime - task.elapsedTime) * 60 * 1000;
        if (remainingTimeMs > 0) {
          const endTime = new Date(task.startTime + remainingTimeMs);
          setEstimatedEndTime(endTime);
        } else {
          setEstimatedEndTime(null);
        }
      } else {
        setEstimatedEndTime(null);
      }

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
      setEstimatedEndTime(null);
      setDisplayTime(task.elapsedTime);
      if (task.targetTime && task.elapsedTime > task.targetTime) {
        setIsOverTarget(true);
      } else {
        setIsOverTarget(false);
      }
      notificationSentRef.current = false;
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
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
        <Grid align="center" gutter="md">
            <Grid.Col span="auto">
                <Stack gap={0}>
                    <Text fw={500} size="lg" truncate>{task.title}</Text>
                    {categoryName && (
                        <Text c="dimmed" size="xs">{categoryName}</Text>
                    )}
                    {task.description && (
                        <Text c="dimmed" size="sm" truncate mt={4}>{task.description}</Text>
                    )}
                </Stack>
            </Grid.Col>
            <Grid.Col span="content">
                <Group gap="md" align="center">
                    {task.targetTime && (
                    <Stack gap={0} align="end">
                        <Text size="xs" c="dimmed">目標</Text>
                        <Text size="lg" c="dimmed">{formatElapsedTime(task.targetTime)}</Text>
                    </Stack>
                    )}
                    <Stack gap={0} align="end">
                        <Text size="xs" c="dimmed">計測</Text>
                        <Text size="lg" c={timeColor} fw={isOverTarget ? 700 : 400}>
                            {formatElapsedTime(displayTime)}
                        </Text>
                        {/* {estimatedEndTime && (
                            <Text size="xs" c="dimmed">
                            (終了予定: {estimatedEndTime.getHours().toString().padStart(2, '0')}:{estimatedEndTime.getMinutes().toString().padStart(2, '0')})
                            </Text>
                        )} */}
                    </Stack>
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
            </Grid.Col>
        </Grid>

        <Group justify="space-between" mt="md" align="center">
            {task.deadline && deadlineText ? (
                <Text size="sm" c={deadlineColor} fw={deadlineFontWeight}>
                    期限: {deadlineText}
                </Text>
            ) : (
                <div /> // Empty div for spacing
            )}
            <Group gap="xs">
                <Button variant="subtle" color="gray" size="compact-xs" onClick={() => onEdit(task)}>
                    編集
                </Button>
                {onResetTimer && task.elapsedTime > 0 && (
                    <Button variant="subtle" color="orange" size="compact-xs" onClick={() => onResetTimer(task.id)}>
                        リセット
                    </Button>
                )}
                <Button variant="subtle" color="red" size="compact-xs" onClick={() => onDelete(task.id)}>
                    削除
                </Button>
                {!task.isRunning && (
                    <Button variant="subtle" color="green" size="compact-xs" onClick={() => onComplete(task.id)}>
                        完了
                    </Button>
                )}
            </Group>
        </Group>
    </Card>
  );
});

TaskCard.displayName = 'TaskCard';

export default React.memo(TaskCard);