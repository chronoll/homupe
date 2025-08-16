
import { NextRequest, NextResponse } from 'next/server';
import { createTask, getAllTasks, getTask, updateTask, deleteTask } from '@/lib/repositories/taskRepository';
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
    const body = await request.json();
    const { isValid, errors } = validateTask(body);

    if (!isValid) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    const newTask = await createTask(body);
    return NextResponse.json(newTask, { status: 201 });
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
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
