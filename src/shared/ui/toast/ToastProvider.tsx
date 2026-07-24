import { Alert, Snackbar } from '@mui/material';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import type { ShowToastOptions, ToastSeverity } from './types';
import { ToastContext } from './useToast';

type ToastItem = {
  id: number;
  message: string;
  severity: ToastSeverity;
  duration: number;
};

let toastSeq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<ToastItem[]>([]);
  const current = queue[0];

  const showToast = useCallback((options: ShowToastOptions | string) => {
    const parsed = typeof options === 'string' ? { message: options } : options;
    const item: ToastItem = {
      id: ++toastSeq,
      message: parsed.message,
      severity: parsed.severity ?? 'success',
      duration: parsed.duration ?? 4000,
    };
    setQueue((prev) => [...prev, item]);
  }, []);

  const dismiss = useCallback(() => {
    setQueue((prev) => prev.slice(1));
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Snackbar
        key={current?.id ?? 'empty'}
        open={Boolean(current)}
        autoHideDuration={current?.duration ?? 4000}
        onClose={(_, reason) => {
          if (reason === 'clickaway') return;
          dismiss();
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={current?.severity ?? 'success'}
          variant="filled"
          onClose={dismiss}
          elevation={3}
          sx={{ width: '100%', minWidth: 280, maxWidth: 480 }}
        >
          {current?.message ?? ''}
        </Alert>
      </Snackbar>
    </ToastContext.Provider>
  );
}
