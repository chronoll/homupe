import React, { useState, useEffect } from 'react';
import { Task, Category } from '@/lib/types';
import { validateTask } from '@/lib/utils';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: Partial<Task>) => void;
  initialTask?: Partial<Task>;
  categories: Category[];
}

const targetTimeOptions = [
  5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 75, 90, 105, 120,
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
  const [targetTime, setTargetTime] = useState<number | undefined>(initialTask?.targetTime);
  const [deadlineDate, setDeadlineDate] = useState(initialTask?.deadline?.date || '');
  const [deadlineTime, setDeadlineTime] = useState(initialTask?.deadline?.time || '');
  const [categoryId, setCategoryId] = useState<string | undefined>(initialTask?.categoryId);
  const [errors, setErrors] = useState<Partial<Record<keyof Task, string>>>({});

  useEffect(() => {
    if (isOpen) {
      setTitle(initialTask?.title || '');
      setDescription(initialTask?.description || '');
      setTargetTime(initialTask?.targetTime);
      setDeadlineDate(initialTask?.deadline?.date || '');
      setDeadlineTime(initialTask?.deadline?.time || '');
      setCategoryId(initialTask?.categoryId);
      setErrors({});
    }
  }, [isOpen, initialTask]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const taskToSave: Partial<Task> = {
      title,
      description: description || undefined,
      targetTime,
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
        <h2 className="text-2xl font-bold mb-4 text-gray-800">
          {initialTask ? 'タスクを編集' : '新しいタスクを作成'}
        </h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="title" className="block text-gray-700 text-sm font-bold mb-2">
              タイトル <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="title"
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            {errors.title && <p className="text-red-500 text-xs italic">{errors.title}</p>}
          </div>

          <div className="mb-4">
            <label htmlFor="description" className="block text-gray-700 text-sm font-bold mb-2">
              説明
            </label>
            <textarea
              id="description"
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline h-24 resize-none"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            ></textarea>
          </div>

          <div className="mb-4">
            <label htmlFor="targetTime" className="block text-gray-700 text-sm font-bold mb-2">
              目標時間 (分)
            </label>
            <select
              id="targetTime"
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              value={targetTime || ''}
              onChange={(e) => setTargetTime(e.target.value ? parseInt(e.target.value) : undefined)}
            >
              <option value="">なし</option>
              {targetTimeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}分
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <label htmlFor="deadlineDate" className="block text-gray-700 text-sm font-bold mb-2">
              期限日
            </label>
            <input
              type="date"
              id="deadlineDate"
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              value={deadlineDate}
              onChange={(e) => setDeadlineDate(e.target.value)}
            />
          </div>

          <div className="mb-4">
            <label htmlFor="deadlineTime" className="block text-gray-700 text-sm font-bold mb-2">
              期限時刻
            </label>
            <input
              type="time"
              id="deadlineTime"
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              value={deadlineTime}
              onChange={(e) => setDeadlineTime(e.target.value)}
            />
          </div>

          <div className="mb-4">
            <label htmlFor="categoryId" className="block text-gray-700 text-sm font-bold mb-2">
              カテゴリ
            </label>
            <select
              id="categoryId"
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              value={categoryId || ''}
              onChange={(e) => setCategoryId(e.target.value || undefined)}
            >
              <option value="">なし</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between">
            <button
              type="submit"
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
            >
              保存
            </button>
            <button
              type="button"
              onClick={onClose}
              className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
            >
              キャンセル
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});

TaskModal.displayName = 'TaskModal';

export default React.memo(TaskModal);