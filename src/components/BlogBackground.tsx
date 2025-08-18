'use client';

import { Box } from '@mantine/core';
import { ReactNode } from 'react';

interface BlogBackgroundProps {
  children: ReactNode;
}

export default function BlogBackground({ children }: BlogBackgroundProps) {
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
      
      {/* 浮遊する光の粒子エフェクト */}
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
        {[...Array(20)].map((_, i) => (
          <Box
            key={i}
            style={{
              position: 'absolute',
              width: '2px',
              height: '2px',
              background: 'rgba(255, 255, 255, 0.5)',
              borderRadius: '50%',
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animation: `float ${15 + Math.random() * 20}s linear infinite`,
              animationDelay: `${Math.random() * 10}s`,
              boxShadow: `
                0 0 10px rgba(255, 255, 255, 0.3),
                0 0 20px rgba(255, 255, 255, 0.2),
                0 0 30px rgba(255, 255, 255, 0.1)
              `,
            }}
          />
        ))}
      </Box>

      {/* コンテンツエリア */}
      <Box style={{ position: 'relative', zIndex: 1 }}>
        {children}
      </Box>

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
    </Box>
  );
}