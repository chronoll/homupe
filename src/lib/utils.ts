
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
 * Formats elapsed time in minutes to a string like "1h 25m".
 * @param minutes The total elapsed time in minutes.
 * @returns A formatted string.
 */
export function formatElapsedTime(minutes: number): string {
  if (minutes < 0) return '0m';
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  if (h > 0) {
    return `${h}h ${m}m`;
  } else {
    return `${m}m`;
  }
}

/**
 * Formats a deadline object into a readable string.
 * @param deadline The deadline object.
 * @returns A formatted date/time string.
 */
export function formatDeadline(deadline?: Task['deadline']): string {
  if (!deadline?.date) return 'No deadline';
  let dateStr = new Date(deadline.date).toLocaleDateString('en-CA'); // YYYY-MM-DD
  if (deadline.time) {
    dateStr += ` ${deadline.time}`;
  }
  return dateStr;
}
