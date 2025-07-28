import { NextResponse } from 'next/server';
import { createClient } from 'redis';

const VISITOR_COUNT_KEY = 'visitor_count';

// Redisクライアントを作成
function createRedisClient() {
    if (!process.env.REDIS_URL) {
        throw new Error('REDIS_URL environment variable is not set');
    }

    return createClient({
        url: process.env.REDIS_URL,
    });
}

// 訪問者数を取得
async function getVisitorCount(): Promise<number> {
    if (!process.env.REDIS_URL) {
        console.log('Redis not available, using fallback');
        return 123; // フォールバック値
    }

    const client = createRedisClient();

    try {
        await client.connect();
        const count = await client.get(VISITOR_COUNT_KEY);
        return count ? parseInt(count, 10) : 0;
    } catch (error) {
        console.error('Error reading visitor count:', error);
        return 123; // エラー時のフォールバック
    } finally {
        await client.quit();
    }
}

// 訪問者数を増加
async function incrementVisitorCount(): Promise<number> {
    if (!process.env.REDIS_URL) {
        console.log('Redis not available, using fallback');
        return 124; // フォールバック値
    }

    const client = createRedisClient();

    try {
        await client.connect();
        const newCount = await client.incr(VISITOR_COUNT_KEY);
        return newCount;
    } catch (error) {
        console.error('Error incrementing visitor count:', error);
        return 124; // エラー時のフォールバック
    } finally {
        await client.quit();
    }
}

export async function GET() {
    try {
        const count = await getVisitorCount();
        return NextResponse.json({ count });
    } catch (error) {
        console.error('GET /api/visitor-count error:', error);
        return NextResponse.json({ error: 'Failed to get visitor count' }, { status: 500 });
    }
}

export async function POST() {
    try {
        const count = await incrementVisitorCount();
        return NextResponse.json({ count });
    } catch (error) {
        console.error('POST /api/visitor-count error:', error);
        return NextResponse.json({ error: 'Failed to increment visitor count' }, { status: 500 });
    }
}
