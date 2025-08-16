
import React from 'react';
import { Task } from '@/lib/types';
import { formatDeadline } from '@/lib/utils';
import Timer from './Timer';
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
      <Group justify="space-between" mb="xs" align="flex-start">
        <Text fw={500} size="lg">{task.title}</Text>
        <Group gap="xs">
          <Button variant="light" color="green" size="xs" onClick={() => onComplete(task.id)}>
            完了
          </Button>
          <Button variant="light" color="red" size="xs" onClick={() => onDelete(task.id)}>
            削除
          </Button>
        </Group>
      </Group>

      {task.description && (
        <Text c="dimmed" size="sm" mb="xs">{task.description}</Text>
      )}

      <Stack gap={4} mt="sm">
        {task.targetTime && (
          <Text size="sm" c="dimmed">
            目標時間: {task.targetTime}分
          </Text>
        )}
        {task.deadline && (
          <Text size="sm" className={deadlineClass}>
            期限: {deadlineText}
          </Text>
        )}
        <Timer task={task} onStart={onStart} onStop={onStop} />
      </Stack>
    </Card>
  );
});

TaskCard.displayName = 'TaskCard';

export default React.memo(TaskCard);
