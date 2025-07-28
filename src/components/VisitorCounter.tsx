'use client';

import { useEffect, useState } from 'react';

export default function VisitorCounter() {
    const [visitorCount, setVisitorCount] = useState<number>(0);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // 初回訪問時に訪問者数を増加
        const incrementVisitor = async () => {
            try {
                const response = await fetch('/api/visitor-count', {
                    method: 'POST',
                });
                const data = await response.json();
                setVisitorCount(data.count);
            } catch (error) {
                console.error('Error incrementing visitor count:', error);
                // エラー時は現在の数を取得
                fetchCurrentCount();
            } finally {
                setIsLoading(false);
            }
        };

        const fetchCurrentCount = async () => {
            try {
                const response = await fetch('/api/visitor-count');
                const data = await response.json();
                setVisitorCount(data.count);
            } catch (error) {
                console.error('Error fetching visitor count:', error);
                setVisitorCount(0);
            } finally {
                setIsLoading(false);
            }
        };

        // セッションストレージで重複訪問を防ぐ
        const hasVisited = sessionStorage.getItem('hasVisited');

        if (!hasVisited) {
            sessionStorage.setItem('hasVisited', 'true');
            incrementVisitor();
        } else {
            fetchCurrentCount();
        }
    }, []);

    const formatCount = (count: number): string => {
        return count.toString().padStart(6, '0');
    };

    if (isLoading) {
        return (
            <div className="retro-border" style={{ marginBottom: '20px', padding: '15px', textAlign: 'center' }}>
                <h3 style={{
                    fontSize: '16px',
                    color: '#dc143c',
                    marginBottom: '10px'
                }}>
                    👥 訪問者数
                </h3>
                <div className="retro-inset" style={{
                    fontSize: '24px',
                    fontFamily: 'Courier Prime, monospace',
                    color: '#000080',
                    fontWeight: 'bold'
                }}>
                    ------
                </div>
                <p style={{ fontSize: '12px', marginTop: '5px' }}>読み込み中...</p>
            </div>
        );
    }

    return (
        <div className="retro-border" style={{ marginBottom: '20px', padding: '15px', textAlign: 'center' }}>
            <h3 style={{
                fontSize: '16px',
                color: '#dc143c',
                marginBottom: '10px'
            }}>
                👥 訪問者数
            </h3>
            <div className="retro-inset" style={{
                fontSize: '24px',
                fontFamily: 'Courier Prime, monospace',
                color: '#000080',
                fontWeight: 'bold'
            }}>
                {formatCount(visitorCount)}
            </div>
            <p style={{ fontSize: '12px', marginTop: '5px' }}>
                あなたは{visitorCount}人目の訪問者です♪
            </p>
        </div>
    );
}
