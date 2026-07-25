import { Close } from '@mui/icons-material';
import { Alert, AlertTitle, Button, IconButton, Snackbar, Stack } from '@mui/material';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import type { ShowToastOptions, ToastAction, ToastSeverity } from './types';
import { ToastContext } from './useToast';

type ToastItem = {
  id: number;
  title: string;
  description: string;
  severity: ToastSeverity;
  duration: number;
  action?: ToastAction;
};

let toastSeq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<ToastItem[]>([]);
  const current = queue[0];

  const showToast = useCallback((options: ShowToastOptions) => {
    const item: ToastItem = {
      id: ++toastSeq,
      title: options.title,
      description: options.description,
      severity: options.severity ?? 'success',
      duration: options.duration ?? 5000,
      action: options.action,
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
        autoHideDuration={current?.duration ?? 5000}
        onClose={(_, reason) => {
          if (reason === 'clickaway') return;
          dismiss();
        }}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        sx={{ top: { xs: 72, sm: 80 } }}
      >
        <Alert
          severity={current?.severity ?? 'success'}
          variant="filled"
          elevation={3}
          sx={{ width: '100%', minWidth: 300, maxWidth: 520 }}
          action={
            <Stack direction="row" spacing={0.5} alignItems="center">
              {current?.action && (
                <Button
                  color="inherit"
                  size="small"
                  variant="text"
                  onClick={() => {
                    current.action?.onClick();
                    dismiss();
                  }}
                  sx={{ fontWeight: 700 }}
                >
                  {current.action.label}
                </Button>
              )}
              <IconButton size="small" color="inherit" aria-label="close" onClick={dismiss}>
                <Close fontSize="small" />
              </IconButton>
            </Stack>
          }
        >
          <AlertTitle sx={{ mb: 0.25, fontWeight: 700 }}>{current?.title ?? ''}</AlertTitle>
          {current?.description ?? ''}
        </Alert>
      </Snackbar>
    </ToastContext.Provider>
  );
}
