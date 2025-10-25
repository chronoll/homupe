'use client';

import { ActionIcon, useMantineColorScheme, useComputedColorScheme } from '@mantine/core';
import { IconSun, IconMoon } from '@tabler/icons-react';
import { useEffect } from 'react';

export function ThemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  const computedColorScheme = useComputedColorScheme('light', { getInitialValueInEffect: true });

  // Tailwind CSS の dark class を制御
  useEffect(() => {
    if (computedColorScheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [computedColorScheme]);

  return (
    <ActionIcon
      onClick={() => setColorScheme(computedColorScheme === 'light' ? 'dark' : 'light')}
      variant="default"
      size="xl"
      aria-label="Toggle color scheme"
    >
      <IconSun className="h-5 w-5" style={{ display: computedColorScheme === 'light' ? 'block' : 'none' }} />
      <IconMoon className="h-5 w-5" style={{ display: computedColorScheme === 'dark' ? 'block' : 'none' }} />
    </ActionIcon>
  );
}
