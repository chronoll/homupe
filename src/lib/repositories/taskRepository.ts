
import { getClient, setJson, getJson, del } from '../redis';
import { Task } from '../types';
import { v4 as uuidv4 } from 'uuid';

const TASK_KEY_PREFIX = 'task:';
const ALL_TASKS_KEY = 'tasks';

// --- Task Repository ---

export const createTask = async (taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'elapsedTime' | 'isRunning'>): Promise<Task> => {
  const client = getClient();
  const taskId = uuidv4();
  const now = Date.now();
  
  const newTask: Task = {
    ...taskData,
    id: taskId,
    elapsedTime: 0,
    isRunning: false,
    createdAt: now,
    updatedAt: now,
  };

  const pipeline = client.pipeline();
  await setJson(`${TASK_KEY_PREFIX}${taskId}`, newTask, pipeline);
  pipeline.sadd(ALL_TASKS_KEY, taskId);
  await pipeline.exec();

  return newTask;
};

export const getTask = async (taskId: string): Promise<Task | null> => {
  return await getJson<Task>(`${TASK_KEY_PREFIX}${taskId}`);
};

export const updateTask = async (taskId: string, taskData: Partial<Task>): Promise<Task | null> => {
  const existingTask = await getTask(taskId);
  if (!existingTask) {
    return null;
  }

  const updatedTask: Task = {
    ...existingTask,
    ...taskData,
    updatedAt: Date.now(),
  };

  await setJson(`${TASK_KEY_PREFIX}${taskId}`, updatedTask);
  return updatedTask;
};

export const deleteTask = async (taskId: string): Promise<void> => {
  const client = getClient();
  const pipeline = client.pipeline();
  await del(`${TASK_KEY_PREFIX}${taskId}`, pipeline);
  pipeline.srem(ALL_TASKS_KEY, taskId);
  // Also remove from category sets if applicable (to be added later)
  await pipeline.exec();
};

export const getAllTasks = async (): Promise<Task[]> => {
  const client = getClient();
  const taskIds = await client.smembers(ALL_TASKS_KEY);
  if (taskIds.length === 0) {
    return [];
  }

  const tasks = await Promise.all(
    taskIds.map(taskId => getTask(taskId))
  );

  return tasks.filter(task => task !== null) as Task[];
};

export const reorderTasks = async (taskIds: string[]): Promise<void> => {
  const client = getClient();
  const pipeline = client.pipeline();

  for (let i = 0; i < taskIds.length; i++) {
    const taskId = taskIds[i];
    const task = await getTask(taskId);
    if (task) {
      const updatedTask = { ...task, order: i };
      setJson(`${TASK_KEY_PREFIX}${taskId}`, updatedTask, pipeline);
    }
  }
  await pipeline.exec();
};
