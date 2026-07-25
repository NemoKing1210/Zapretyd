import { useEffect, useState } from 'react';
import { api } from '../api/zapretyd';

export type ErrorLogEntry = {
  id: string;
  at: number;
  message: string;
  raw: string;
  source: string;
};

const MAX_ENTRIES = 200;
const FLUSH_DELAY_MS = 80;
const MAX_BATCH = 40;

let entries: ErrorLogEntry[] = [];
let seq = 0;
const listeners = new Set<() => void>();

let pendingPersist: ErrorLogEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let flushing = false;

function emit() {
  for (const listener of listeners) listener();
}

function armFlushTimer() {
  if (flushTimer !== undefined) return;
  flushTimer = setTimeout(() => {
    flushTimer = undefined;
    void flushPersist();
  }, FLUSH_DELAY_MS);
}

function schedulePersist(entry: ErrorLogEntry) {
  if (import.meta.env.DEV) return;
  pendingPersist.push(entry);
  if (pendingPersist.length >= MAX_BATCH) {
    void flushPersist();
    return;
  }
  armFlushTimer();
}

async function flushPersist() {
  if (flushTimer !== undefined) {
    clearTimeout(flushTimer);
    flushTimer = undefined;
  }
  if (flushing || pendingPersist.length === 0) return;
  flushing = true;
  const batch = pendingPersist.splice(0, MAX_BATCH);
  try {
    await api.appendErrorLogs(
      batch.map(({ message, raw, source, at }) => ({ message, raw, source, at })),
    );
  } catch {
    // Swallow — logging must never throw into the UI.
  } finally {
    flushing = false;
    if (pendingPersist.length === 0) return;
    if (pendingPersist.length >= MAX_BATCH) {
      void flushPersist();
    } else {
      armFlushTimer();
    }
  }
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
  const entry: ErrorLogEntry = {
    id: `${Date.now()}-${++seq}`,
    at: Date.now(),
    message,
    raw: options?.raw ?? message,
    source: options?.source ?? 'app',
  };

  if (import.meta.env.DEV) {
    entries = [entry, ...entries].slice(0, MAX_ENTRIES);
    emit();
    return;
  }

  schedulePersist(entry);
}

function splitErrorPayload(raw: string): { code: string; detail: string } {
  const pipe = raw.indexOf('|');
  if (pipe === -1) return { code: raw, detail: '' };
  return { code: raw.slice(0, pipe), detail: raw.slice(pipe + 1) };
}

/** Build a multi-line diagnostic body for file / DEV logs. */
export function formatErrorLogBody(
  cause: unknown,
  message: string,
  options?: { source?: string },
): string {
  const raw = String(cause);
  const { code, detail } = splitErrorPayload(raw);
  const lines = [
    `code: ${code}`,
    `message: ${message}`,
  ];
  if (options?.source) lines.push(`caller: ${options.source}`);
  if (detail.trim()) {
    lines.push('detail:');
    lines.push(detail.trimEnd());
  }
  if (cause instanceof Error && cause.stack) {
    lines.push('stack:');
    lines.push(cause.stack);
  } else if (raw !== code && !detail) {
    lines.push(`raw: ${raw}`);
  }
  return lines.join('\n');
}

/** Translate (optional), push to the error log, and return the display message. */
export function reportCaughtError(
  cause: unknown,
  options?: { source?: string; translate?: (raw: string) => string },
): string {
  const raw = String(cause);
  const message = options?.translate?.(raw) ?? raw;
  pushErrorLog(message, {
    raw: formatErrorLogBody(cause, message, { source: options?.source }),
    source: options?.source,
  });
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
  const onError = (event: ErrorEvent) => {
    const message = event.message || 'Uncaught error';
    const cause =
      event.error instanceof Error
        ? event.error
        : new Error(String(event.message || event.error || 'Uncaught error'));
    pushErrorLog(message, {
      raw: formatErrorLogBody(cause, message, { source: 'window.onerror' }),
      source: 'window.onerror',
    });
  };

  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    pushErrorLog(message, {
      raw: formatErrorLogBody(reason, message, { source: 'unhandledrejection' }),
      source: 'unhandledrejection',
    });
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
