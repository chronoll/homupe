
import React, { useState, useEffect } from 'react';
import { Category } from '@/lib/types';
import { validateCategory } from '@/lib/utils';
import { Modal, TextInput, Button, Group, Text, ColorPicker, rem } from '@mantine/core';

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (category: Partial<Category>) => void;
  initialCategory?: Partial<Category>;
}

const colors = [
  '#EF4444', // Red
  '#F97316', // Orange
  '#F59E0B', // Amber
  '#EAB308', // Yellow
  '#84CC16', // Lime
  '#22C55E', // Green
  '#10B981', // Emerald
  '#06B6D4', // Cyan
  '#0EA5E9', // Sky
  '#3B82F6', // Blue
  '#6366F1', // Indigo
  '#8B5CF6', // Violet
  '#A855F7', // Purple
  '#D946EF', // Fuchsia
  '#EC4899', // Pink
  '#F43F5E', // Rose
  '#6B7280', // Gray
];

const CategoryModal: React.FC<CategoryModalProps> = React.memo(({
  isOpen,
  onClose,
  onSave,
  initialCategory,
}) => {
  const [name, setName] = useState(initialCategory?.name || '');
  const [color, setColor] = useState(initialCategory?.color || colors[0]);
  const [errors, setErrors] = useState<Partial<Record<keyof Category, string>>>({});

  useEffect(() => {
    if (isOpen) {
      setName(initialCategory?.name || '');
      setColor(initialCategory?.color || colors[0]);
      setErrors({});
    }
  }, [isOpen, initialCategory]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const categoryToSave: Partial<Category> = {
      name,
      color,
    };

    const { isValid, errors: validationErrors } = validateCategory(categoryToSave);
    if (!isValid) {
      setErrors(validationErrors);
      return;
    }

    onSave(categoryToSave);
    onClose();
  };

  return (
    <Modal opened={isOpen} onClose={onClose} title={initialCategory ? 'カテゴリを編集' : '新しいカテゴリを作成'} centered>
      <form onSubmit={handleSubmit}>
        <TextInput
          label="カテゴリ名"
          placeholder="カテゴリ名を入力"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          required
          error={errors.name}
          mb="md"
        />

        <Text size="sm" fw={500} mb={rem(4)}>
          色
        </Text>
        <Group gap="xs" mb="xl">
          {colors.map((c) => (
            <div
              key={c}
              style={{
                backgroundColor: c,
                width: rem(30),
                height: rem(30),
                borderRadius: rem(30),
                cursor: 'pointer',
                border: `${rem(2)} solid ${color === c ? 'var(--mantine-color-blue-5)' : 'transparent'}`,
              }}
              onClick={() => setColor(c)}
            />
          ))}
        </Group>

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

CategoryModal.displayName = 'CategoryModal';

export default React.memo(CategoryModal);
