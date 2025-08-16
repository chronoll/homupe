import { NextRequest, NextResponse } from 'next/server';
import { GET, POST, PUT, DELETE } from '../route';

// Mock NextResponse and NextRequest
jest.mock('next/server', () => ({
  NextResponse: jest.fn((body, init) => ({
    status: init?.status || 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(body),
  })) as jest.MockedFunction<typeof NextResponse> & {
    json: typeof NextResponse.json;
    next: typeof NextResponse.next;
  },
  NextRequest: jest.fn((input, init) => ({
    url: input,
    json: () => Promise.resolve(JSON.parse(init?.body as string)),
    text: () => Promise.resolve(init?.body as string),
    headers: new Headers(init?.headers),
    method: init?.method || 'GET',
    nextUrl: new URL(input),
  })),
}));

// Manually add the static json method to the mocked NextResponse
(NextResponse as jest.MockedFunction<typeof NextResponse>).json = jest.fn((data, init) => ({
  status: init?.status || 200,
  json: () => Promise.resolve(data),
}));

(NextResponse as jest.MockedFunction<typeof NextResponse>).next = jest.fn();

// Mock the repository functions
jest.mock('@/lib/repositories/taskRepository', () => ({
  createTask: jest.fn((task) => ({ id: 'new-id', ...task, createdAt: Date.now(), updatedAt: Date.now() })),
  getAllTasks: jest.fn(() => [
    { id: '1', title: 'Task 1', elapsedTime: 0, isRunning: false, createdAt: Date.now(), updatedAt: Date.now(), order: 0 },
    { id: '2', title: 'Task 2', elapsedTime: 0, isRunning: false, createdAt: Date.now(), updatedAt: Date.now(), order: 1 },
  ]),
  getTask: jest.fn((id) => {
    if (id === '1') return { id: '1', title: 'Task 1', elapsedTime: 0, isRunning: false, createdAt: Date.now(), updatedAt: Date.now(), order: 0 };
    return null;
  }),
  updateTask: jest.fn((id, data) => ({
    id,
    title: 'Updated Task',
    elapsedTime: 0,
    isRunning: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    order: 0,
    ...data,
  })),
  deleteTask: jest.fn(() => {}),
  reorderTasks: jest.fn(() => {}),
}));

jest.mock('@/lib/repositories/timerRepository', () => ({
  startTimer: jest.fn((id) => ({
    taskId: id,
    startTime: Date.now(),
    elapsedTime: 0,
    isRunning: true,
  })),
  stopTimer: jest.fn((id) => ({
    taskId: id,
    startTime: Date.now() - 60000,
    elapsedTime: 1,
    isRunning: false,
  })),
}));

jest.mock('@/lib/utils', () => ({
  validateTask: jest.fn(() => ({ isValid: true, errors: {} })),
}));

describe('Tasks API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /api/tasks should return all tasks', async () => {
    const request = new NextRequest('http://localhost/api/tasks');
    const response = await GET(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveLength(2);
    expect(data[0].title).toBe('Task 1');
  });

  it('GET /api/tasks?id=[id] should return a single task', async () => {
    const request = new NextRequest('http://localhost/api/tasks?id=1');
    const response = await GET(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.title).toBe('Task 1');
  });

  it('POST /api/tasks should create a new task', async () => {
    const request = new NextRequest('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'New Task', description: 'Desc' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.title).toBe('New Task');
    expect(data.id).toBeDefined();
  });

  it('PUT /api/tasks?id=[id] should update a task', async () => {
    const request = new NextRequest('http://localhost/api/tasks?id=1', {
      method: 'PUT',
      body: JSON.stringify({ title: 'Updated Task' }),
    });
    const response = await PUT(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.title).toBe('Updated Task');
  });

  it('DELETE /api/tasks?id=[id] should delete a task', async () => {
    const request = new NextRequest('http://localhost/api/tasks?id=1', {
      method: 'DELETE',
    });
    const response = await DELETE(request);
    expect(response.status).toBe(204);
    const text = await response.text();
    expect(text).toBe(null); // NextResponse(null) results in null text
  });

  it('POST /api/tasks?action=complete&id=[id] should complete a task', async () => {
    const request = new NextRequest('http://localhost/api/tasks?action=complete&id=1', {
      method: 'POST',
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.completedAt).toBeDefined();
  });

  it('POST /api/tasks?action=startTimer&id=[id] should start a timer', async () => {
    const request = new NextRequest('http://localhost/api/tasks?action=startTimer&id=1', {
      method: 'POST',
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.isRunning).toBe(true);
  });

  it('POST /api/tasks?action=stopTimer&id=[id] should stop a timer', async () => {
    const request = new NextRequest('http://localhost/api/tasks?action=stopTimer&id=1', {
      method: 'POST',
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.isRunning).toBe(false);
  });

  it('PUT /api/tasks?action=reorder should reorder tasks', async () => {
    const request = new NextRequest('http://localhost/api/tasks?action=reorder', {
      method: 'PUT',
      body: JSON.stringify({ taskIds: ['2', '1'] }),
    });
    const response = await PUT(request);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toBe(null); // Expect no body for reorder
  });
});
