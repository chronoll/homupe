import React from 'react';
import { ActionIcon, rem } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';

interface FloatingCreateButtonProps {
  onClick: () => void;
}

const FloatingCreateButton: React.FC<FloatingCreateButtonProps> = React.memo(({
  onClick,
}) => {
  return (
    <ActionIcon
      onClick={onClick}
      variant="filled"
      size={rem(56)}
      radius="xl"
      aria-label="新しいタスクを作成"
      style={{
        position: 'fixed',
        bottom: rem(20),
        left: rem(20),
        zIndex: 1000,
      }}
    >
      <IconPlus style={{ width: rem(32), height: rem(32) }} stroke={1.5} />
    </ActionIcon>
  );
});

FloatingCreateButton.displayName = 'FloatingCreateButton';

export default React.memo(FloatingCreateButton);