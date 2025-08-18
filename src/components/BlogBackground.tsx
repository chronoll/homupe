'use client';

import { Box } from '@mantine/core';
import { ReactNode, useEffect, useState } from 'react';

interface BlogBackgroundProps {
  children: ReactNode;
}

// 固定された粒子の位置とアニメーション設定
const particles = [
  // 大きな粒子（星のような効果）
  { left: 24.16, top: 12.04, duration: 29.88, delay: 7.00, size: 6, type: 'star' },
  { left: 89.70, top: 43.92, duration: 29.34, delay: 4.79, size: 6, type: 'star' },
  { left: 8.96, top: 95.57, duration: 32.23, delay: 5.19, size: 6, type: 'star' },
  { left: 90.99, top: 62.90, duration: 33.32, delay: 0.11, size: 6, type: 'star' },
  { left: 50.32, top: 6.73, duration: 19.93, delay: 6.88, size: 6, type: 'star' },
  { left: 94.38, top: 65.28, duration: 32.56, delay: 8.41, size: 6, type: 'star' },
  { left: 74.45, top: 83.44, duration: 33.85, delay: 3.44, size: 6, type: 'star' },
  { left: 82.13, top: 4.06, duration: 18.11, delay: 8.53, size: 6, type: 'star' },
  
  // 中程度の粒子（光の点）
  { left: 35.38, top: 14.80, duration: 27.96, delay: 1.45, size: 4, type: 'dot' },
  { left: 38.15, top: 72.51, duration: 25.58, delay: 7.77, size: 4, type: 'dot' },
  { left: 10.56, top: 29.30, duration: 22.43, delay: 4.58, size: 4, type: 'dot' },
  { left: 28.44, top: 27.41, duration: 30.14, delay: 4.99, size: 4, type: 'dot' },
  { left: 60.05, top: 83.86, duration: 19.06, delay: 6.67, size: 4, type: 'dot' },
  { left: 11.65, top: 5.42, duration: 30.08, delay: 2.94, size: 4, type: 'dot' },
  { left: 47.47, top: 73.56, duration: 20.41, delay: 7.61, size: 4, type: 'dot' },
  { left: 28.73, top: 83.57, duration: 28.08, delay: 5.60, size: 4, type: 'dot' },
  { left: 1.85, top: 7.10, duration: 29.13, delay: 0.12, size: 4, type: 'dot' },
  { left: 30.67, top: 15.56, duration: 28.60, delay: 9.04, size: 4, type: 'dot' },
  { left: 14.30, top: 23.30, duration: 30.21, delay: 3.74, size: 4, type: 'dot' },
  { left: 31.48, top: 64.66, duration: 25.42, delay: 9.96, size: 4, type: 'dot' },
  
  // 追加の粒子（より多くの光の効果）
  { left: 15.20, top: 35.80, duration: 26.50, delay: 2.30, size: 3, type: 'small' },
  { left: 65.40, top: 18.90, duration: 31.20, delay: 5.70, size: 3, type: 'small' },
  { left: 45.80, top: 89.20, duration: 23.40, delay: 8.90, size: 3, type: 'small' },
  { left: 78.30, top: 55.60, duration: 27.80, delay: 1.20, size: 3, type: 'small' },
  { left: 22.10, top: 67.40, duration: 24.60, delay: 6.80, size: 3, type: 'small' },
  { left: 88.50, top: 25.30, duration: 29.90, delay: 3.50, size: 3, type: 'small' },
  { left: 12.70, top: 78.10, duration: 21.30, delay: 9.10, size: 3, type: 'small' },
  { left: 67.90, top: 41.20, duration: 25.70, delay: 4.40, size: 3, type: 'small' },
  { left: 33.60, top: 52.80, duration: 28.40, delay: 7.60, size: 3, type: 'small' },
  { left: 56.20, top: 9.70, duration: 22.80, delay: 2.90, size: 3, type: 'small' },
  { left: 91.40, top: 71.50, duration: 26.10, delay: 5.20, size: 3, type: 'small' },
  { left: 7.80, top: 46.30, duration: 30.60, delay: 8.40, size: 3, type: 'small' },
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
          {particles.map((particle, i) => {
            const getParticleStyle = () => {
              const baseStyle = {
                position: 'absolute' as const,
                left: `${particle.left}%`,
                top: `${particle.top}%`,
                animation: `float ${particle.duration}s linear infinite`,
                animationDelay: `${particle.delay}s`,
                borderRadius: '50%',
              };

              switch (particle.type) {
                case 'star':
                  return {
                    ...baseStyle,
                    width: `${particle.size}px`,
                    height: `${particle.size}px`,
                    background: 'rgba(255, 255, 255, 0.9)',
                    boxShadow: `
                      0 0 ${particle.size * 2}px rgba(255, 255, 255, 0.8),
                      0 0 ${particle.size * 4}px rgba(139, 92, 246, 0.4),
                      0 0 ${particle.size * 6}px rgba(34, 211, 238, 0.3)
                    `,
                    '&::before': {
                      content: '""',
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      borderRadius: '50%',
                      animation: `twinkle ${2 + (i % 3)}s ease-in-out infinite`,
                    },
                  };
                case 'dot':
                  return {
                    ...baseStyle,
                    width: `${particle.size}px`,
                    height: `${particle.size}px`,
                    background: 'rgba(255, 255, 255, 0.7)',
                    boxShadow: `
                      0 0 ${particle.size * 1.5}px rgba(255, 255, 255, 0.6),
                      0 0 ${particle.size * 3}px rgba(34, 211, 238, 0.3)
                    `,
                  };
                case 'small':
                  return {
                    ...baseStyle,
                    width: `${particle.size}px`,
                    height: `${particle.size}px`,
                    background: 'rgba(255, 255, 255, 0.5)',
                    boxShadow: `
                      0 0 ${particle.size}px rgba(255, 255, 255, 0.4),
                      0 0 ${particle.size * 2}px rgba(255, 255, 255, 0.2)
                    `,
                  };
                default:
                  return baseStyle;
              }
            };

            return (
              <Box
                key={i}
                style={getParticleStyle()}
              />
            );
          })}
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
            50% {
              opacity: 0.8;
              transform: translateY(50vh) translateX(50px) scale(1.2);
            }
            90% {
              opacity: 1;
            }
            100% {
              transform: translateY(-100vh) translateX(100px);
              opacity: 0;
            }
          }
          
          @keyframes twinkle {
            0%, 100% {
              opacity: 0.5;
              transform: scale(1);
            }
            50% {
              opacity: 1;
              transform: scale(1.3);
            }
          }
        `}</style>
      )}
    </Box>
  );
}