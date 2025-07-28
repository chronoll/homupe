import { NextRequest, NextResponse } from 'next/server';
import { createClient } from 'redis';

interface BBSPost {
    id: number;
    name: string;
    message: string;
    timestamp: string;
}

const BBS_POSTS_KEY = 'bbs_posts';

function createRedisClient() {
    if (!process.env.REDIS_URL) {
        throw new Error('REDIS_URL environment variable is not set');
    }

    return createClient({
        url: process.env.REDIS_URL,
    });
}

async function getPosts(): Promise<BBSPost[]> {
    if (!process.env.REDIS_URL) {
        console.log('Redis not available, using fallback');
        return [];
    }

    const client = createRedisClient();

    try {
        await client.connect();
        const postsJson = await client.get(BBS_POSTS_KEY);
        return postsJson ? JSON.parse(postsJson) : [];
    } catch (error) {
        console.error('Error reading BBS posts:', error);
        return [];
    } finally {
        await client.quit();
    }
}

async function savePosts(posts: BBSPost[]): Promise<void> {
    if (!process.env.REDIS_URL) {
        console.log('Redis not available, cannot save posts');
        return;
    }

    const client = createRedisClient();

    try {
        await client.connect();
        await client.set(BBS_POSTS_KEY, JSON.stringify(posts));
    } catch (error) {
        console.error('Error saving BBS posts:', error);
    } finally {
        await client.quit();
    }
}

async function addPost(name: string, message: string): Promise<BBSPost> {
    const posts = await getPosts();
    const newPost: BBSPost = {
        id: Date.now(),
        name: name.trim() || '名無しさん',
        message: message.trim(),
        timestamp: new Date().toLocaleString('ja-JP')
    };

    posts.unshift(newPost);

    if (posts.length > 20) {
        posts.splice(20);
    }

    await savePosts(posts);
    return newPost;
}

export async function GET() {
    try {
        const posts = await getPosts();
        return NextResponse.json({ posts });
    } catch (error) {
        console.error('GET /api/bbs error:', error);
        return NextResponse.json({ error: 'Failed to get posts' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const { name, message } = await request.json();

        if (!message || message.trim().length === 0) {
            return NextResponse.json({ error: 'メッセージが空です' }, { status: 400 });
        }

        if (message.trim().length > 200) {
            return NextResponse.json({ error: 'メッセージが長すぎます（200文字以内）' }, { status: 400 });
        }

        const newPost = await addPost(name, message);
        return NextResponse.json({ post: newPost });
    } catch (error) {
        console.error('POST /api/bbs error:', error);
        return NextResponse.json({ error: '投稿に失敗しました' }, { status: 500 });
    }
}
