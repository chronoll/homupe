import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const COUNTER_FILE = path.join(process.cwd(), 'data', 'visitor-count.json');

// データディレクトリとファイルを初期化
function initializeCounterFile() {
    const dataDir = path.dirname(COUNTER_FILE);

    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    if (!fs.existsSync(COUNTER_FILE)) {
        fs.writeFileSync(COUNTER_FILE, JSON.stringify({ count: 0 }));
    }
}

// 訪問者数を取得
function getVisitorCount(): number {
    try {
        initializeCounterFile();
        const data = fs.readFileSync(COUNTER_FILE, 'utf8');
        return JSON.parse(data).count;
    } catch (error) {
        console.error('Error reading visitor count:', error);
        return 0;
    }
}

// 訪問者数を増加
function incrementVisitorCount(): number {
    try {
        initializeCounterFile();
        const currentCount = getVisitorCount();
        const newCount = currentCount + 1;
        fs.writeFileSync(COUNTER_FILE, JSON.stringify({ count: newCount }));
        return newCount;
    } catch (error) {
        console.error('Error incrementing visitor count:', error);
        return 0;
    }
}

export async function GET() {
    const count = getVisitorCount();
    return NextResponse.json({ count });
}

export async function POST() {
    const count = incrementVisitorCount();
    return NextResponse.json({ count });
}
