
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
 * Formats elapsed time in minutes (float) to a string like "1h 25m 30s".
 * @param totalMinutes The total elapsed time in minutes (can be float).
 * @returns A formatted string.
 */
export function formatElapsedTime(totalMinutes: number): string {
  if (totalMinutes < 0) return '0s';

  const totalSeconds = Math.floor(totalMinutes * 60);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  const parts: string[] = [];
  if (h > 0) {
    parts.push(`${h}h`);
  }
  if (m > 0 || h > 0) { // Show minutes if there are hours, or if it's the largest unit
    parts.push(`${m}m`);
  }
  parts.push(`${s}s`);

  return parts.join(' ');
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
