import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

const VISITOR_COUNT_KEY = 'visitor_count';

// 訪問者数を取得
async function getVisitorCount(): Promise<number> {
    try {
        const count = await kv.get<number>(VISITOR_COUNT_KEY);
        return count || 0;
    } catch (error) {
        console.error('Error reading visitor count:', error);
        return 0;
    }
}

// 訪問者数を増加
async function incrementVisitorCount(): Promise<number> {
    try {
        const newCount = await kv.incr(VISITOR_COUNT_KEY);
        return newCount;
    } catch (error) {
        console.error('Error incrementing visitor count:', error);
        return 0;
    }
}

export async function GET() {
    const count = await getVisitorCount();
    return NextResponse.json({ count });
}

export async function POST() {
    const count = await incrementVisitorCount();
    return NextResponse.json({ count });
}
