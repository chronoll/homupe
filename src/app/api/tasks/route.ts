
import { NextRequest, NextResponse } from 'next/server';
import { createTask, getAllTasks, getTask, updateTask, deleteTask, reorderTasks } from '@/lib/repositories/taskRepository';
import { startTimer, stopTimer } from '@/lib/repositories/timerRepository';
import { validateTask } from '@/lib/utils';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (id) {
      const task = await getTask(id);
      if (!task) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }
      return NextResponse.json(task);
    } else {
      const tasks = await getAllTasks();
      return NextResponse.json(tasks);
    }
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const id = searchParams.get('id');

    if (action === 'complete') {
      if (!id) {
        return NextResponse.json({ error: 'Task ID is required for completion' }, { status: 400 });
      }
      const updatedTask = await updateTask(id, { completedAt: Date.now() });
      if (!updatedTask) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }
      return NextResponse.json(updatedTask);
    } else if (action === 'startTimer') {
      if (!id) {
        return NextResponse.json({ error: 'Task ID is required to start timer' }, { status: 400 });
      }
      const timer = await startTimer(id);
      if (!timer) {
        return NextResponse.json({ error: 'Task not found or timer already running' }, { status: 404 });
      }
      return NextResponse.json(timer);
    } else if (action === 'stopTimer') {
      if (!id) {
        return NextResponse.json({ error: 'Task ID is required to stop timer' }, { status: 400 });
      }
      const timer = await stopTimer(id);
      if (!timer) {
        return NextResponse.json({ error: 'Task not found or timer not running' }, { status: 404 });
      }
      return NextResponse.json(timer);
    } else {
      // Default task creation
      const body = await request.json();
      const { isValid, errors } = validateTask(body);

      if (!isValid) {
        return NextResponse.json({ errors }, { status: 400 });
      }

      const newTask = await createTask(body);
      return NextResponse.json(newTask, { status: 201 });
    }
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to process POST request' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const action = searchParams.get('action');

    if (action === 'reorder') {
      const body = await request.json();
      const { taskIds } = body;
      if (!Array.isArray(taskIds)) {
        return NextResponse.json({ error: 'taskIds must be an array' }, { status: 400 });
      }
      await reorderTasks(taskIds);
      return new NextResponse(null, { status: 200 });
    } else if (!id) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }

    const body = await request.json();
    const { isValid, errors } = validateTask(body);

    if (!isValid) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    const updatedTask = await updateTask(id, body);
    if (!updatedTask) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    return NextResponse.json(updatedTask);
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }

    await deleteTask(id);
    return new NextResponse(null, { status: 204 });
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
  }
}
