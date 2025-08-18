
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import TaskCard from '../TaskCard';
import { Task } from '@/lib/types';

// Mock the Timer component to avoid its internal logic interfering with TaskCard tests
jest.mock('../Timer', () => {
  return jest.fn(({ task }) => <div data-testid="mock-timer">{task.elapsedTime}m</div>);
});

const mockTask: Task = {
  id: '1',
  title: 'Test Task',
  description: 'This is a test description',
  elapsedTime: 30,
  isRunning: false,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  order: 0,
};

describe('TaskCard', () => {
  it('renders task details correctly', () => {
    render(
      <TaskCard
        task={mockTask}
        onComplete={jest.fn()}
        onDelete={jest.fn()}
        onStart={jest.fn()}
        onStop={jest.fn()}
      />
    );

    expect(screen.getByText('Test Task')).toBeInTheDocument();
    expect(screen.getByText('This is a test description')).toBeInTheDocument();
    expect(screen.getByText('完了')).toBeInTheDocument();
    expect(screen.getByText('削除')).toBeInTheDocument();
    expect(screen.getByTestId('mock-timer')).toBeInTheDocument();
  });

  it('calls onComplete when complete button is clicked', () => {
    const handleComplete = jest.fn();
    render(
      <TaskCard
        task={mockTask}
        onComplete={handleComplete}
        onDelete={jest.fn()}
        onStart={jest.fn()}
        onStop={jest.fn()}
      />
    );

    fireEvent.click(screen.getByText('完了'));
    expect(handleComplete).toHaveBeenCalledTimes(1);
    expect(handleComplete).toHaveBeenCalledWith('1');
  });

  it('calls onDelete when delete button is clicked', () => {
    const handleDelete = jest.fn();
    render(
      <TaskCard
        task={mockTask}
        onComplete={jest.fn()}
        onDelete={handleDelete}
        onStart={jest.fn()}
        onStop={jest.fn()}
      />
    );

    fireEvent.click(screen.getByText('削除'));
    expect(handleDelete).toHaveBeenCalledTimes(1);
    expect(handleDelete).toHaveBeenCalledWith('1');
  });

  it('displays deadline if provided', () => {
    const taskWithDeadline = {
      ...mockTask,
      deadline: { date: '2025-12-31', time: '10:00' },
    };
    render(
      <TaskCard
        task={taskWithDeadline}
        onComplete={jest.fn()}
        onDelete={jest.fn()}
        onStart={jest.fn()}
        onStop={jest.fn()}
      />
    );
    expect(screen.getByText(/期限:/)).toBeInTheDocument();
  });
});
