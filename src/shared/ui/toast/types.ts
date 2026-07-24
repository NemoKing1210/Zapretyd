export type ToastSeverity = 'success' | 'info' | 'warning' | 'error';

export type ShowToastOptions = {
  message: string;
  severity?: ToastSeverity;
  duration?: number;
};
