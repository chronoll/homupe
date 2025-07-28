'use client';

import { useEffect, useState } from 'react';

interface BBSPost {
    id: number;
    name: string;
    message: string;
    timestamp: string;
}

export default function BBSBoard() {
    const [posts, setPosts] = useState<BBSPost[]>([]);
    const [name, setName] = useState('');
    const [message, setMessage] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    // 投稿を取得
    const fetchPosts = async () => {
        try {
            const response = await fetch('/api/bbs');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            setPosts(data.posts || []);
        } catch (err) {
            console.error('Error fetching posts:', err);
            setError('投稿の取得に失敗しました');
        } finally {
            setIsLoading(false);
        }
    };

    // 投稿を送信
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!message.trim()) {
            setError('メッセージを入力してください');
            return;
        }

        if (message.trim().length > 200) {
            setError('メッセージが長すぎます（200文字以内）');
            return;
        }

        setIsSubmitting(true);
        setError('');

        try {
            const response = await fetch('/api/bbs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name, message }),
            });

            if (response.ok) {
                setMessage('');
                setName('');
                fetchPosts(); // 投稿後に再取得
            } else {
                const errorData = await response.json();
                setError(errorData.error || '投稿に失敗しました');
            }
        } catch {
            setError('投稿に失敗しました');
        } finally {
            setIsSubmitting(false);
        }
    };

    useEffect(() => {
        fetchPosts();
    }, []);

    return (
        <div className="retro-border" style={{ marginBottom: '20px', padding: '15px' }}>
            <h3 className="heisei-title" style={{
                fontSize: '16px',
                color: '#ff6347',
                borderBottom: '1px solid #ff6347',
                paddingBottom: '5px',
                marginBottom: '10px'
            }}>
                ◆ ひとこと掲示板
            </h3>

            {/* 投稿フォーム */}
            <form onSubmit={handleSubmit} style={{ marginBottom: '15px' }}>
                <div style={{ marginBottom: '8px' }}>
                    <input
                        type="text"
                        placeholder="なまえ（省略可）"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={20}
                        style={{
                            width: '100%',
                            padding: '4px',
                            fontSize: '12px',
                            border: '1px solid #ccc',
                            borderRadius: '2px'
                        }}
                    />
                </div>
                <div style={{ marginBottom: '8px' }}>
                    <textarea
                        placeholder="メッセージ（200文字以内）"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        maxLength={200}
                        rows={3}
                        style={{
                            width: '100%',
                            padding: '4px',
                            fontSize: '12px',
                            border: '1px solid #ccc',
                            borderRadius: '2px',
                            resize: 'vertical'
                        }}
                    />
                </div>
                {error && (
                    <div style={{ color: '#ff0000', fontSize: '11px', marginBottom: '8px' }}>
                        {error}
                    </div>
                )}
                <button
                    type="submit"
                    disabled={isSubmitting}
                    className="retro-button"
                    style={{
                        fontSize: '12px',
                        padding: '4px 8px',
                        opacity: isSubmitting ? 0.6 : 1
                    }}
                >
                    {isSubmitting ? '投稿中...' : '投稿'}
                </button>
            </form>

            {/* 投稿一覧 */}
            <div className="retro-inset" style={{
                maxHeight: '200px',
                overflowY: 'auto',
                padding: '8px',
                fontSize: '11px',
                lineHeight: '1.4'
            }}>
                {isLoading ? (
                    <div style={{ textAlign: 'center', color: '#666' }}>読み込み中...</div>
                ) : posts.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#666' }}>まだ投稿がありません</div>
                ) : (
                    posts.map((post) => (
                        <div key={post.id} style={{
                            marginBottom: '10px',
                            paddingBottom: '8px',
                            borderBottom: '1px dotted #ccc'
                        }}>
                            <div style={{ fontWeight: 'bold', color: '#0066cc' }}>
                                {post.name}
                            </div>
                            <div style={{ margin: '2px 0', wordWrap: 'break-word' }}>
                                {post.message}
                            </div>
                            <div style={{ fontSize: '10px', color: '#666' }}>
                                {post.timestamp}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
