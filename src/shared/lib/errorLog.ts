import { useEffect, useState } from 'react';

export type ErrorLogEntry = {
  id: string;
  at: number;
  message: string;
  raw: string;
  source: string;
};

const MAX_ENTRIES = 200;

let entries: ErrorLogEntry[] = [];
let seq = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function getErrorLog(): readonly ErrorLogEntry[] {
  return entries;
}

export function clearErrorLog() {
  if (entries.length === 0) return;
  entries = [];
  emit();
}

export function pushErrorLog(
  message: string,
  options?: { raw?: string; source?: string },
) {
  if (!import.meta.env.DEV) return;
  const entry: ErrorLogEntry = {
    id: `${Date.now()}-${++seq}`,
    at: Date.now(),
    message,
    raw: options?.raw ?? message,
    source: options?.source ?? 'app',
  };
  entries = [entry, ...entries].slice(0, MAX_ENTRIES);
  emit();
}

/** Translate (optional), push to the DEV error log, and return the display message. */
export function reportCaughtError(
  cause: unknown,
  options?: { source?: string; translate?: (raw: string) => string },
): string {
  const raw = String(cause);
  const message = options?.translate?.(raw) ?? raw;
  pushErrorLog(message, { raw, source: options?.source });
  return message;
}

export function subscribeErrorLog(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useErrorLog(): ErrorLogEntry[] {
  const [log, setLog] = useState(() => [...getErrorLog()]);
  useEffect(() => subscribeErrorLog(() => setLog([...getErrorLog()])), []);
  return log;
}

export function installGlobalErrorHandlers(): () => void {
  if (!import.meta.env.DEV) return () => undefined;

  const onError = (event: ErrorEvent) => {
    const raw =
      event.error instanceof Error
        ? (event.error.stack ?? event.error.message)
        : String(event.message || event.error || 'Uncaught error');
    pushErrorLog(event.message || 'Uncaught error', {
      raw,
      source: 'window.onerror',
    });
  };

  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    const raw =
      reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
    pushErrorLog(message, { raw, source: 'unhandledrejection' });
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
