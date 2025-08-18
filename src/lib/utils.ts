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
 * Formats work time in minutes to a string (e.g., "01:30").
 * @param totalMinutes The total work time in minutes.
 * @returns A formatted time string in HH:MM format.
 */
export function formatWorkTime(totalMinutes: number): string {
  if (totalMinutes < 0) totalMinutes = 0;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const pad = (num: number) => num.toString().padStart(2, '0');
  return `${pad(h)}:${pad(m)}`;
}

/**
 * Formats a deadline object into a readable string and determines its style.
 * @param deadline The deadline object.
 * @returns An object containing the formatted text and style properties.
 */
export function formatDeadline(deadline?: Task['deadline']): { text: string; color: string; fontWeight: number } {
  if (!deadline?.date) {
    return { text: '', color: 'gray', fontWeight: 400 };
  }

  const deadlineDateTime = new Date(deadline.date + (deadline.time ? `T${deadline.time}` : 'T23:59:59'));
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let color = 'gray';
  let fontWeight = 400;

  if (deadlineDateTime < today) {
    // Expired
    color = 'red';
    fontWeight = 700;
  } else if (deadlineDateTime >= today && deadlineDateTime < new Date(today.getTime() + 24 * 60 * 60 * 1000)) {
    // Today is the deadline
    color = 'orange';
    fontWeight = 400; // Not bold, just orange
  }

  const displayOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  };

  if (deadline.time) {
    displayOptions.hour = '2-digit';
    displayOptions.minute = '2-digit';
    displayOptions.hour12 = false;
  }

  const formattedDateTime = deadlineDateTime.toLocaleDateString('ja-JP', displayOptions);

  return { text: formattedDateTime, color, fontWeight };
}