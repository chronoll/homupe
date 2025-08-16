
import React, { useState, useEffect } from 'react';
import { Task, Category } from '@/lib/types';
import { validateTask } from '@/lib/utils';
import { Modal, TextInput, Textarea, Select, Button, Group } from '@mantine/core';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: Partial<Task>) => void;
  initialTask?: Partial<Task>;
  categories: Category[];
}

const targetTimeOptions = [
  { value: '5', label: '5分' },
  { value: '10', label: '10分' },
  { value: '15', label: '15分' },
  { value: '20', label: '20分' },
  { value: '25', label: '25分' },
  { value: '30', label: '30分' },
  { value: '35', label: '35分' },
  { value: '40', label: '40分' },
  { value: '45', label: '45分' },
  { value: '50', label: '50分' },
  { value: '60', label: '1時間' },
  { value: '75', label: '1時間15分' },
  { value: '90', label: '1時間30分' },
  { value: '105', label: '1時間45分' },
  { value: '120', label: '2時間' },
];

const TaskModal: React.FC<TaskModalProps> = React.memo(({
  isOpen,
  onClose,
  onSave,
  initialTask,
  categories,
}) => {
  const [title, setTitle] = useState(initialTask?.title || '');
  const [description, setDescription] = useState(initialTask?.description || '');
  const [targetTime, setTargetTime] = useState<string | null>(initialTask?.targetTime?.toString() || null);
  const [deadlineDate, setDeadlineDate] = useState(initialTask?.deadline?.date || '');
  const [deadlineTime, setDeadlineTime] = useState(initialTask?.deadline?.time || '');
  const [categoryId, setCategoryId] = useState<string | null>(initialTask?.categoryId || null);
  const [errors, setErrors] = useState<Partial<Record<keyof Task, string>>>({});

  useEffect(() => {
    if (isOpen) {
      setTitle(initialTask?.title || '');
      setDescription(initialTask?.description || '');
      setTargetTime(initialTask?.targetTime?.toString() || null);
      setDeadlineDate(initialTask?.deadline?.date || '');
      setDeadlineTime(initialTask?.deadline?.time || '');
      setCategoryId(initialTask?.categoryId || null);
      setErrors({});
    }
  }, [isOpen, initialTask]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const taskToSave: Partial<Task> = {
      title,
      description: description || undefined,
      targetTime: targetTime ? parseInt(targetTime) : undefined,
      deadline: deadlineDate
        ? { date: deadlineDate, time: deadlineTime || undefined }
        : undefined,
      categoryId: categoryId || undefined,
    };

    const { isValid, errors: validationErrors } = validateTask(taskToSave);
    if (!isValid) {
      setErrors(validationErrors);
      return;
    }

    onSave(taskToSave);
    onClose();
  };

  return (
    <Modal opened={isOpen} onClose={onClose} title={initialTask ? 'タスクを編集' : '新しいタスクを作成'} centered>
      <form onSubmit={handleSubmit}>
        <TextInput
          label="タイトル"
          placeholder="タスクのタイトル"
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
          required
          error={errors.title}
          mb="md"
        />

        <Textarea
          label="説明"
          placeholder="タスクの説明"
          value={description}
          onChange={(event) => setDescription(event.currentTarget.value)}
          autosize
          minRows={2}
          mb="md"
        />

        <Select
          label="目標時間 (分)"
          placeholder="目標時間を選択"
          data={targetTimeOptions}
          value={targetTime}
          onChange={setTargetTime}
          clearable
          mb="md"
        />

        <TextInput
          label="期限日"
          type="date"
          placeholder="期限日を選択"
          value={deadlineDate}
          onChange={(event) => setDeadlineDate(event.currentTarget.value)}
          mb="md"
        />

        <TextInput
          label="期限時刻"
          type="time"
          placeholder="HH:MM"
          value={deadlineTime}
          onChange={(event) => setDeadlineTime(event.currentTarget.value)}
          mb="md"
        />

        <Select
          label="カテゴリ"
          placeholder="カテゴリを選択"
          data={categories.map(cat => ({ value: cat.id, label: cat.name }))}
          value={categoryId}
          onChange={setCategoryId}
          clearable
          mb="xl"
        />

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            キャンセル
          </Button>
          <Button type="submit">
            保存
          </Button>
        </Group>
      </form>
    </Modal>
  );
});

TaskModal.displayName = 'TaskModal';

export default React.memo(TaskModal);
