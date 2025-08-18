import redis from '@/lib/redis';
import { NextResponse } from 'next/server';

const WORK_TIME_KEY = 'work_time_goal';
const redisClient = redis();

export async function GET() {
  try {
    const workTime = await redisClient.get(WORK_TIME_KEY);
    return NextResponse.json({ minutes: workTime ? parseInt(workTime as string, 10) : 0 });
  } catch (error) {
    console.error('Error getting work time:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { minutes } = await request.json();
    if (typeof minutes !== 'number' || minutes < 0) {
      return new NextResponse('Invalid input', { status: 400 });
    }
    await redisClient.set(WORK_TIME_KEY, minutes);
    return NextResponse.json({ minutes });
  } catch (error) {
    console.error('Error setting work time:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}