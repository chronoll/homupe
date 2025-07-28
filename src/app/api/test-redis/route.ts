import { NextResponse } from 'next/server';
import { createClient } from 'redis';

export async function GET() {
    try {
        if (!process.env.REDIS_URL) {
            return NextResponse.json({
                success: false,
                error: 'REDIS_URL environment variable is not set',
                envVars: {
                    REDIS_URL: 'Not set'
                }
            }, { status: 500 });
        }

        const client = createClient({
            url: process.env.REDIS_URL,
        });

        await client.connect();

        // 簡単なテスト
        await client.set('test', 'hello');
        const result = await client.get('test');

        await client.quit();

        return NextResponse.json({
            success: true,
            message: 'Redis connection successful',
            testResult: result,
            envVars: {
                REDIS_URL: 'Set'
            }
        });
    } catch (error) {
        console.error('Redis connection error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            envVars: {
                REDIS_URL: process.env.REDIS_URL ? 'Set' : 'Not set'
            }
        }, { status: 500 });
    }
}
