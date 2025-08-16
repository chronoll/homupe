import React, { useState, useEffect } from 'react';
import { Category } from '@/lib/types';
import { validateCategory } from '@/lib/utils';

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
        <h2 className="text-2xl font-bold mb-4 text-gray-800">
          {initialCategory ? 'カテゴリを編集' : '新しいカテゴリを作成'}
        </h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="name" className="block text-gray-700 text-sm font-bold mb-2">
              カテゴリ名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="name"
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            {errors.name && <p className="text-red-500 text-xs italic">{errors.name}</p>}
          </div>

          <div className="mb-4">
            <label htmlFor="color" className="block text-gray-700 text-sm font-bold mb-2">
              色
            </label>
            <div className="grid grid-cols-6 gap-2">
              {colors.map((c) => (
                <div
                  key={c}
                  className={`w-10 h-10 rounded-full cursor-pointer flex items-center justify-center border-2 ${color === c ? 'border-blue-500' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                >
                  {color === c && (
                    <svg
                      className="w-6 h-6 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M5 13l4 4L19 7"
                      ></path>
                    </svg>
                  )}
                </div>
              ))}
            </div>
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

CategoryModal.displayName = 'CategoryModal';

export default React.memo(CategoryModal);