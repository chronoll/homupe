'use client';

import React, { useState, useEffect } from 'react';
import { Task } from '@/lib/types';
import { formatElapsedTime } from '@/lib/utils';

const FinishedTasksPage = () => {
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCompletedTasks = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/tasks');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const tasks: Task[] = await response.json();
        setCompletedTasks(tasks.filter(task => task.completedAt));
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'An unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchCompletedTasks();
  }, []);

  if (loading) {
    return <div className="container mx-auto p-4">読み込み中...</div>;
  }

  if (error) {
    return <div className="container mx-auto p-4 text-red-600">エラー: {error}</div>;
  }

  const totalCompletedTime = completedTasks.reduce((sum, task) => sum + task.elapsedTime, 0);
  const totalTargetTime = completedTasks.reduce((sum, task) => sum + (task.targetTime || 0), 0);

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">完了したタスク</h1>

      <div className="bg-white shadow-md rounded-lg p-6 mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-gray-700">統計</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-gray-600">
          <div>
            <p className="text-sm">完了タスク数:</p>
            <p className="text-xl font-bold">{completedTasks.length}</p>
          </div>
          <div>
            <p className="text-sm">合計計測時間:</p>
            <p className="text-xl font-bold">{formatElapsedTime(totalCompletedTime)}</p>
          </div>
          <div>
            <p className="text-sm">合計目標時間:</p>
            <p className="text-xl font-bold">{formatElapsedTime(totalTargetTime)}</p>
          </div>
        </div>
      </div>

      {completedTasks.length === 0 ? (
        <p className="text-gray-600">完了したタスクはありません。</p>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {completedTasks.map((task) => {
            const completedDate = task.completedAt ? new Date(task.completedAt).toLocaleDateString('ja-JP') : 'N/A';
            const timeDifference = task.elapsedTime - (task.targetTime || 0);
            const timeDiffClass = timeDifference > 0 ? 'text-red-600' : 'text-green-600';

            return (
              <div key={task.id} className="bg-white shadow-md rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-800 mb-1">{task.title}</h3>
                <p className="text-gray-600 text-sm mb-2">{task.description}</p>
                <div className="text-sm text-gray-500 grid grid-cols-2 gap-1">
                  <p>完了日: <span className="font-medium">{completedDate}</span></p>
                  <p>計測時間: <span className="font-medium">{formatElapsedTime(task.elapsedTime)}</span></p>
                  <p>目標時間: <span className="font-medium">{task.targetTime ? formatElapsedTime(task.targetTime) : 'なし'}</span></p>
                  <p>差分: <span className={`font-medium ${timeDiffClass}`}>{formatElapsedTime(Math.abs(timeDifference))} {timeDifference > 0 ? '超過' : '短縮'}</span></p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default FinishedTasksPage;