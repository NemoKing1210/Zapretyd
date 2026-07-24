import { Box } from '@mui/material';
import type { ReactNode } from 'react';

const DURATION_MS = 220;

export function PageTransition({
  pageKey,
  children,
}: {
  pageKey: string;
  children: ReactNode;
}) {
  return (
    <Box
      key={pageKey}
      sx={{
        animation: `zapretydPageIn ${DURATION_MS}ms ease`,
        '@keyframes zapretydPageIn': {
          from: { opacity: 0, transform: 'translateY(8px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
        '@media (prefers-reduced-motion: reduce)': {
          animation: 'none',
        },
      }}
    >
      {children}
    </Box>
  );
}
