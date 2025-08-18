import { setJson, getJson } from '../redis';
import { Timer } from '../types';
import { getTask, updateTask } from './taskRepository';

const TIMER_KEY_PREFIX = 'timer:';

// --- Timer Repository ---

export const getTimer = async (taskId: string): Promise<Timer | null> => {
  return await getJson<Timer>(`${TIMER_KEY_PREFIX}${taskId}`);
};

export const startTimer = async (taskId: string): Promise<Timer | null> => {
  const task = await getTask(taskId);
  if (!task) {
    return null;
  }

  const now = Date.now();
  const timer: Timer = {
    taskId,
    startTime: now,
    elapsedTime: task.elapsedTime || 0,
    isRunning: true,
    targetTime: task.targetTime,
  };

  await updateTask(taskId, { isRunning: true, startTime: now });
  await setJson(`${TIMER_KEY_PREFIX}${taskId}`, timer);

  return timer;
};

export const stopTimer = async (taskId: string): Promise<Timer | null> => {
  const timer = await getTimer(taskId);
  const task = await getTask(taskId);

  if (!timer || !task || !timer.isRunning) {
    return null;
  }

  const now = Date.now();
  const newElapsedTime = timer.elapsedTime + (now - timer.startTime) / (1000 * 60); // in minutes

  const updatedTimer: Timer = {
    ...timer,
    isRunning: false,
    elapsedTime: newElapsedTime,
  };

  await updateTask(taskId, { isRunning: false, elapsedTime: newElapsedTime });
  await setJson(`${TIMER_KEY_PREFIX}${taskId}`, updatedTimer);

  return updatedTimer;
};

export const resetTimer = async (taskId: string): Promise<Timer | null> => {
    const task = await getTask(taskId);
    if (!task) {
        return null;
    }

    const updatedTimer: Timer = {
        taskId,
        startTime: 0,
        elapsedTime: 0,
        isRunning: false,
        targetTime: task.targetTime,
    };

    await updateTask(taskId, { isRunning: false, elapsedTime: 0, startTime: 0 });
    await setJson(`${TIMER_KEY_PREFIX}${taskId}`, updatedTimer);

    return updatedTimer;
};