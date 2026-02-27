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
        position: 'relative',
        minHeight: '100vh',
        width: '100%',
        background: 'linear-gradient(160deg, #f8fafc 0%, #eef2ff 40%, #f0f9ff 70%, #faf5ff 100%)',
      }}
    >
      {/* Subtle decorative gradient orbs */}
      <Box
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: 'none',
          zIndex: 0,
          overflow: 'hidden',
        }}
      >
        <Box
          style={{
            position: 'absolute',
            top: '-10%',
            right: '-5%',
            width: '40vw',
            height: '40vw',
            maxWidth: '600px',
            maxHeight: '600px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(99, 102, 241, 0.06) 0%, transparent 70%)',
          }}
        />
        <Box
          style={{
            position: 'absolute',
            bottom: '10%',
            left: '-10%',
            width: '50vw',
            height: '50vw',
            maxWidth: '700px',
            maxHeight: '700px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(139, 92, 246, 0.05) 0%, transparent 70%)',
          }}
        />
        <Box
          style={{
            position: 'absolute',
            top: '40%',
            right: '20%',
            width: '30vw',
            height: '30vw',
            maxWidth: '400px',
            maxHeight: '400px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(14, 165, 233, 0.04) 0%, transparent 70%)',
          }}
        />
      </Box>

      {/* Content */}
      <Box
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          minHeight: '100vh',
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
