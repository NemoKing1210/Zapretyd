import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { api, type ServiceStatus, type StrategyInfo } from '../../shared/api/zapretyd';
import { useTranslation } from '../../shared/i18n';
import { reportCaughtError } from '../../shared/lib/errorLog';
import { sameServiceStatus } from '../../shared/lib/serviceStatus';
import { useToast, type ShowToastOptions } from '../../shared/ui/toast';

const POLL_MS = 5000;

type ServiceStatusState = {
  status: ServiceStatus | undefined;
  serviceBusy: boolean;
};

type ServiceStatusApi = {
  refreshStatus: () => Promise<void>;
  applyStatus: (next: ServiceStatus) => void;
  setPollingEnabled: (enabled: boolean) => void;
  runServiceAction: (
    action: () => Promise<unknown>,
    options?: {
      refreshVersions?: boolean;
      successToast?: Pick<ShowToastOptions, 'title' | 'description'>;
      source?: string;
      onVersions?: () => Promise<void>;
      onError?: (cause: unknown, source: string) => void;
    },
  ) => Promise<void>;
};

const ServiceStatusStateContext = createContext<ServiceStatusState | null>(null);
const ServiceStatusApiContext = createContext<ServiceStatusApi | null>(null);

export function ServiceStatusProvider({ children }: { children: ReactNode }) {
  const { translateError } = useTranslation();
  const { showToast } = useToast();
  const [status, setStatus] = useState<ServiceStatus>();
  const [serviceBusy, setServiceBusy] = useState(false);
  const [enabled, setPollingEnabled] = useState(false);
  const [windowFocused, setWindowFocused] = useState(true);
  const translateErrorRef = useRef(translateError);
  const showToastRef = useRef(showToast);

  useEffect(() => {
    translateErrorRef.current = translateError;
    showToastRef.current = showToast;
  }, [translateError, showToast]);

  const applyStatus = useCallback((next: ServiceStatus) => {
    setStatus((prev) => (sameServiceStatus(prev, next) ? prev : next));
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      applyStatus(await api.status());
    } catch (cause) {
      reportCaughtError(cause, {
        source: 'app.statusPoll',
        translate: translateErrorRef.current,
      });
    }
  }, [applyStatus]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (!cancelled) setWindowFocused(focused);
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => {
        /* non-Tauri / tests: keep polling */
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      if (!windowFocused) return;
      void refreshStatus();
    };
    const id = window.setInterval(tick, POLL_MS);
    return () => window.clearInterval(id);
  }, [enabled, refreshStatus, windowFocused]);

  useEffect(() => {
    if (!enabled || !windowFocused) return;
    if (document.visibilityState !== 'visible') return;
    void refreshStatus();
  }, [enabled, windowFocused, refreshStatus]);

  const runServiceAction = useCallback(
    async (
      action: () => Promise<unknown>,
      options?: {
        refreshVersions?: boolean;
        successToast?: Pick<ShowToastOptions, 'title' | 'description'>;
        source?: string;
        onVersions?: () => Promise<void>;
        onError?: (cause: unknown, source: string) => void;
      },
    ) => {
      const source = options?.source ?? 'service';
      setServiceBusy(true);
      try {
        await action();
        if (options?.refreshVersions && options.onVersions) {
          await options.onVersions();
        } else {
          await refreshStatus();
        }
        if (options?.successToast) showToastRef.current(options.successToast);
        window.setTimeout(() => void refreshStatus(), 1200);
        window.setTimeout(() => void refreshStatus(), 3500);
      } catch (cause) {
        options?.onError?.(cause, source);
      } finally {
        setServiceBusy(false);
      }
    },
    [refreshStatus],
  );

  const state = useMemo(() => ({ status, serviceBusy }), [status, serviceBusy]);
  const apiValue = useMemo(
    () => ({ refreshStatus, applyStatus, setPollingEnabled, runServiceAction }),
    [refreshStatus, applyStatus, runServiceAction],
  );

  return (
    <ServiceStatusApiContext.Provider value={apiValue}>
      <ServiceStatusStateContext.Provider value={state}>
        {children}
      </ServiceStatusStateContext.Provider>
    </ServiceStatusApiContext.Provider>
  );
}

/** Subscribes to status/busy — re-renders on poll when values change. */
export function useServiceStatusState() {
  const context = useContext(ServiceStatusStateContext);
  if (!context) throw new Error('useServiceStatusState must be used within ServiceStatusProvider');
  return context;
}

/** Stable actions — does not re-render when status changes. */
export function useServiceStatusApi() {
  const context = useContext(ServiceStatusApiContext);
  if (!context) throw new Error('useServiceStatusApi must be used within ServiceStatusProvider');
  return context;
}

/** Stable activate/start helpers that read toast copy via refs — for page props. */
export function useServiceControls(options: {
  onError: (cause: unknown, source: string) => void;
  /** Refresh installed versions + status (activate / remove service). */
  refreshAll: () => Promise<void>;
}) {
  const { runServiceAction } = useServiceStatusApi();
  const { status, serviceBusy } = useServiceStatusState();
  const { t } = useTranslation();
  const onErrorRef = useRef(options.onError);
  const refreshAllRef = useRef(options.refreshAll);
  const tRef = useRef(t);
  useEffect(() => {
    onErrorRef.current = options.onError;
    refreshAllRef.current = options.refreshAll;
    tRef.current = t;
  }, [options.onError, options.refreshAll, t]);

  const onActivate = useCallback(
    (strategy: StrategyInfo) =>
      runServiceAction(() => api.activate(strategy), {
        refreshVersions: true,
        onVersions: () => refreshAllRef.current(),
        successToast: {
          title: tRef.current('toast.serviceActivated.title'),
          description: tRef.current('toast.serviceActivated.body'),
        },
        source: 'service.activate',
        onError: (cause, source) => onErrorRef.current(cause, source),
      }),
    [runServiceAction],
  );

  const onStart = useCallback(
    () =>
      runServiceAction(api.start, {
        successToast: {
          title: tRef.current('toast.serviceStarted.title'),
          description: tRef.current('toast.serviceStarted.body'),
        },
        source: 'service.start',
        onError: (cause, source) => onErrorRef.current(cause, source),
      }),
    [runServiceAction],
  );

  const onStop = useCallback(
    () =>
      runServiceAction(api.stop, {
        successToast: {
          title: tRef.current('toast.serviceStopped.title'),
          description: tRef.current('toast.serviceStopped.body'),
        },
        source: 'service.stop',
        onError: (cause, source) => onErrorRef.current(cause, source),
      }),
    [runServiceAction],
  );

  const onRemove = useCallback(
    () =>
      runServiceAction(api.removeService, {
        refreshVersions: true,
        onVersions: () => refreshAllRef.current(),
        successToast: {
          title: tRef.current('toast.serviceRemoved.title'),
          description: tRef.current('toast.serviceRemoved.body'),
        },
        source: 'service.remove',
        onError: (cause, source) => onErrorRef.current(cause, source),
      }),
    [runServiceAction],
  );

  const onAdmin = useCallback(
    () =>
      runServiceAction(api.relaunchAsAdmin, {
        source: 'service.relaunchAdmin',
        onError: (cause, source) => onErrorRef.current(cause, source),
      }),
    [runServiceAction],
  );

  return { status, serviceBusy, onActivate, onStart, onStop, onRemove, onAdmin };
}
