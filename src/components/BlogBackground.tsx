'use client';

import { Box } from '@mantine/core';
import { ReactNode, useEffect, useState } from 'react';

interface BlogBackgroundProps {
  children: ReactNode;
}

// 固定された粒子の位置とアニメーション設定
const particles = [
  { left: 24.16, top: 12.04, duration: 29.88, delay: 7.00 },
  { left: 35.38, top: 14.80, duration: 27.96, delay: 1.45 },
  { left: 89.70, top: 43.92, duration: 29.34, delay: 4.79 },
  { left: 38.15, top: 72.51, duration: 25.58, delay: 7.77 },
  { left: 10.56, top: 29.30, duration: 22.43, delay: 4.58 },
  { left: 8.96, top: 95.57, duration: 32.23, delay: 5.19 },
  { left: 90.99, top: 62.90, duration: 33.32, delay: 0.11 },
  { left: 28.44, top: 27.41, duration: 30.14, delay: 4.99 },
  { left: 60.05, top: 83.86, duration: 19.06, delay: 6.67 },
  { left: 50.32, top: 6.73, duration: 19.93, delay: 6.88 },
  { left: 11.65, top: 5.42, duration: 30.08, delay: 2.94 },
  { left: 47.47, top: 73.56, duration: 20.41, delay: 7.61 },
  { left: 94.38, top: 65.28, duration: 32.56, delay: 8.41 },
  { left: 28.73, top: 83.57, duration: 28.08, delay: 5.60 },
  { left: 1.85, top: 7.10, duration: 29.13, delay: 0.12 },
  { left: 74.45, top: 83.44, duration: 33.85, delay: 3.44 },
  { left: 30.67, top: 15.56, duration: 28.60, delay: 9.04 },
  { left: 14.30, top: 23.30, duration: 30.21, delay: 3.74 },
  { left: 82.13, top: 4.06, duration: 18.11, delay: 8.53 },
  { left: 31.48, top: 64.66, duration: 25.42, delay: 9.96 },
];

export default function BlogBackground({ children }: BlogBackgroundProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  return (
    <Box
      style={{
        minHeight: '100vh',
        position: 'relative',
        background: `
          linear-gradient(135deg, 
            rgba(17, 24, 39, 0.95) 0%, 
            rgba(31, 41, 55, 0.95) 25%, 
            rgba(55, 65, 81, 0.9) 50%, 
            rgba(75, 85, 99, 0.85) 75%, 
            rgba(99, 102, 241, 0.3) 100%
          ),
          radial-gradient(circle at 20% 80%, rgba(139, 92, 246, 0.15) 0%, transparent 50%),
          radial-gradient(circle at 80% 20%, rgba(34, 211, 238, 0.1) 0%, transparent 50%),
          radial-gradient(circle at 40% 40%, rgba(251, 146, 60, 0.08) 0%, transparent 50%),
          linear-gradient(180deg, #0f172a 0%, #1e293b 100%)
        `,
        backgroundAttachment: 'fixed',
        overflow: 'hidden',
      }}
    >
      {/* アニメーション付きグラデーションオーバーレイ */}
      <Box
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: `
            repeating-linear-gradient(
              90deg,
              transparent,
              transparent 2px,
              rgba(255, 255, 255, 0.03) 2px,
              rgba(255, 255, 255, 0.03) 4px
            ),
            repeating-linear-gradient(
              0deg,
              transparent,
              transparent 2px,
              rgba(255, 255, 255, 0.03) 2px,
              rgba(255, 255, 255, 0.03) 4px
            )
          `,
          pointerEvents: 'none',
        }}
      />
      
      {/* 浮遊する光の粒子エフェクト - クライアントサイドでのみレンダリング */}
      {isMounted && (
        <Box
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          {particles.map((particle, i) => (
            <Box
              key={i}
              style={{
                position: 'absolute',
                width: '2px',
                height: '2px',
                background: 'rgba(255, 255, 255, 0.5)',
                borderRadius: '50%',
                left: `${particle.left}%`,
                top: `${particle.top}%`,
                animation: `float ${particle.duration}s linear infinite`,
                animationDelay: `${particle.delay}s`,
                boxShadow: `
                  0 0 10px rgba(255, 255, 255, 0.3),
                  0 0 20px rgba(255, 255, 255, 0.2),
                  0 0 30px rgba(255, 255, 255, 0.1)
                `,
              }}
            />
          ))}
        </Box>
      )}

      {/* コンテンツエリア */}
      <Box style={{ position: 'relative', zIndex: 1 }}>
        {children}
      </Box>

      {isMounted && (
        <style jsx global>{`
          @keyframes float {
            0% {
              transform: translateY(100vh) translateX(0);
              opacity: 0;
            }
            10% {
              opacity: 1;
            }
            90% {
              opacity: 1;
            }
            100% {
              transform: translateY(-100vh) translateX(100px);
              opacity: 0;
            }
          }
        `}</style>
      )}
    </Box>
  );
}