import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

interface BBSPost {
    id: number;
    name: string;
    message: string;
    timestamp: string;
}

const BBS_POSTS_KEY = 'bbs_posts';

// 投稿を取得
async function getPosts(): Promise<BBSPost[]> {
    try {
        const posts = await kv.get<BBSPost[]>(BBS_POSTS_KEY);
        return posts || [];
    } catch (error) {
        console.error('Error reading BBS posts:', error);
        return [];
    }
}

// 投稿を保存
async function savePosts(posts: BBSPost[]): Promise<void> {
    try {
        await kv.set(BBS_POSTS_KEY, posts);
    } catch (error) {
        console.error('Error saving BBS posts:', error);
    }
}

// 投稿を追加
async function addPost(name: string, message: string): Promise<BBSPost> {
    const posts = await getPosts();
    const newPost: BBSPost = {
        id: Date.now(),
        name: name.trim() || '名無しさん',
        message: message.trim(),
        timestamp: new Date().toLocaleString('ja-JP')
    };

    posts.unshift(newPost); // 新しい投稿を先頭に追加

    // 最新20件のみ保持
    if (posts.length > 20) {
        posts.splice(20);
    }

    await savePosts(posts);
    return newPost;
}

export async function GET() {
    const posts = await getPosts();
    return NextResponse.json({ posts });
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
        console.error('Error adding post:', error);
        return NextResponse.json({ error: '投稿に失敗しました' }, { status: 500 });
    }
}
