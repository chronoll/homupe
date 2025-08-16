
import { Task, Category } from './types';

// --- Validation Functions ---

export function validateTask(task: Partial<Task>): { isValid: boolean; errors: Partial<Record<keyof Task, string>> } {
  const errors: Partial<Record<keyof Task, string>> = {};

  if (!task.title || task.title.trim().length === 0) {
    errors.title = 'Title is required.';
  }

  if (task.targetTime && task.targetTime < 0) {
    errors.targetTime = 'Target time cannot be negative.';
  }

  if (task.elapsedTime && task.elapsedTime < 0) {
    errors.elapsedTime = 'Elapsed time cannot be negative.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateCategory(category: Partial<Category>): { isValid: boolean; errors: Partial<Record<keyof Category, string>> } {
  const errors: Partial<Record<keyof Category, string>> = {};

  if (!category.name || category.name.trim().length === 0) {
    errors.name = 'Category name is required.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

// --- Time Formatting Functions ---

/**
 * Formats elapsed time in minutes to a string (e.g., "1:25:30" or "59:59").
 * If the time is one hour or more, it returns "h:mm:ss".
 * Otherwise, it returns "mm:ss".
 * @param totalMinutes The total elapsed time in minutes.
 * @returns A formatted time string.
 */
export function formatElapsedTime(totalMinutes: number): string {
  if (totalMinutes < 0) totalMinutes = 0;

  const totalSeconds = Math.floor(totalMinutes * 60);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  const pad = (num: number) => num.toString().padStart(2, '0');

  if (h > 0) {
    return `${h}:${pad(m)}:${pad(s)}`;
  }
  return `${pad(m)}:${pad(s)}`;
}

/**
 * Formats a deadline object into a readable string and determines its status.
 * @param deadline The deadline object.
 * @returns An object containing the formatted string and a status class.
 */
export function formatDeadline(deadline?: Task['deadline']): { text: string; className: string } {
  if (!deadline?.date) return { text: 'No deadline', className: '' };

  const deadlineDateTime = new Date(deadline.date + (deadline.time ? `T${deadline.time}` : ''));
  const now = new Date();
  const diff = deadlineDateTime.getTime() - now.getTime(); // milliseconds
  const oneDay = 1000 * 60 * 60 * 24;

  let text = '';
  let className = '';

  if (diff < 0) {
    text = '期限切れ';
    className = 'text-red-600 font-medium';
  } else if (diff < oneDay) {
    text = '今日まで';
    className = 'text-orange-600 font-medium';
  } else if (diff < oneDay * 2) {
    text = '明日まで';
    className = 'text-yellow-600 font-medium';
  } else {
    text = deadlineDateTime.toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' });
    if (deadline.time) {
      text += ` ${deadline.time}`;
    }
  }

  return { text, className };
}
