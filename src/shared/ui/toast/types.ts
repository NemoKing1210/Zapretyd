export type ToastSeverity = 'success' | 'info' | 'warning' | 'error';

export type ToastAction = {
  label: string;
  onClick: () => void;
};

export type ShowToastOptions = {
  message: string;
  severity?: ToastSeverity;
  duration?: number;
  action?: ToastAction;
};
