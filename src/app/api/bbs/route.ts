import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

interface BBSPost {
    id: number;
    name: string;
    message: string;
    timestamp: string;
}

const BBS_FILE = path.join(process.cwd(), 'data', 'bbs-posts.json');

// データファイルを初期化
function initializeBBSFile() {
    const dataDir = path.dirname(BBS_FILE);

    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    if (!fs.existsSync(BBS_FILE)) {
        fs.writeFileSync(BBS_FILE, JSON.stringify([]));
    }
}

// 投稿を取得
function getPosts(): BBSPost[] {
    try {
        initializeBBSFile();
        const data = fs.readFileSync(BBS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading BBS posts:', error);
        return [];
    }
}

// 投稿を保存
function savePosts(posts: BBSPost[]): void {
    try {
        initializeBBSFile();
        fs.writeFileSync(BBS_FILE, JSON.stringify(posts, null, 2));
    } catch (error) {
        console.error('Error saving BBS posts:', error);
    }
}

// 投稿を追加
function addPost(name: string, message: string): BBSPost {
    const posts = getPosts();
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

    savePosts(posts);
    return newPost;
}

export async function GET() {
    const posts = getPosts();
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

        const newPost = addPost(name, message);
        return NextResponse.json({ post: newPost });
    } catch (error) {
        console.error('Error adding post:', error);
        return NextResponse.json({ error: '投稿に失敗しました' }, { status: 500 });
    }
}
