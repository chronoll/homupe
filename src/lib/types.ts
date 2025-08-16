
export interface Task {
  id: string;
  title: string;
  description?: string;
  categoryId?: string;
  targetTime?: number; // in minutes
  elapsedTime: number; // in minutes
  isRunning: boolean;
  startTime?: number; // timestamp
  deadline?: {
    date: string; // YYYY-MM-DD
    time?: string; // HH:MM (optional)
  };
  order: number; // order within a category
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface Timer {
  taskId: string;
  startTime: number;
  elapsedTime: number;
  isRunning: boolean;
  targetTime?: number;
}
