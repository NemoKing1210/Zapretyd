import { CssBaseline, ThemeProvider, Box } from '@mui/material';
import { useColorScheme } from '@mui/material/styles';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  normalizeThemeMode,
  type AppSettings,
  type InstalledVersion,
  type ReleaseInfo,
} from '../shared/api/zapretyd';
import { useTranslation } from '../shared/i18n';
import { installGlobalErrorHandlers, reportCaughtError } from '../shared/lib/errorLog';
import { PageTransition } from '../shared/ui/PageTransition';
import { ErrorAlert } from '../shared/ui/ErrorAlert';
import { ToastProvider, useToast } from '../shared/ui/toast';
import type { ShowToastOptions } from '../shared/ui/toast';
import { theme } from './theme';
import { WindowChromeSync } from './WindowChromeSync';
import { AppShell, type PageKey } from '../widgets/app-shell/ui/AppShell';
import { OverviewPage } from '../pages/overview/ui/OverviewPage';
import { VersionsPage } from '../pages/versions/ui/VersionsPage';
import { SettingsPage } from '../pages/settings/ui/SettingsPage';
import { LogsPage } from '../pages/logs/ui/LogsPage';
import {
  ServiceStatusProvider,
  useServiceControls,
  useServiceStatusApi,
  useServiceStatusState,
} from '../features/service-status/ServiceStatusProvider';

const MemoSettingsPage = memo(SettingsPage);

function OverviewRoute({
  versions,
  latestTag,
  showError,
  refreshAll,
}: {
  versions: InstalledVersion[];
  latestTag?: string;
  showError: (cause: unknown, source?: string) => void;
  refreshAll: () => Promise<void>;
}) {
  const { status, serviceBusy, onActivate, onStart, onStop, onRemove, onAdmin } = useServiceControls(
    { onError: showError, refreshAll },
  );
  return (
    <OverviewPage
      status={status}
      versions={versions}
      latestTag={latestTag}
      serviceBusy={serviceBusy}
      loadStrategies={api.strategies}
      onActivate={onActivate}
      onStart={onStart}
      onStop={onStop}
      onRemove={onRemove}
      onAdmin={onAdmin}
      onStrategiesError={(cause) => showError(cause, 'service.strategies')}
    />
  );
}

function VersionsRoute({
  versions,
  latestTag,
  libraryPath,
  releasesNetwork,
  releasesNetworkError,
  busy,
  error,
  installingTag,
  downloadRatio,
  versionsTab,
  setVersionsTab,
  setError,
  install,
  runAction,
  markReleasesReachable,
  showError,
  refreshAll,
}: {
  versions: InstalledVersion[];
  latestTag?: string;
  libraryPath?: string;
  releasesNetwork: 'ok' | 'offline' | 'unreachable';
  releasesNetworkError?: string;
  busy: boolean;
  error: string;
  installingTag?: string;
  downloadRatio?: number;
  versionsTab: 'installed' | 'all';
  setVersionsTab: (tab: 'installed' | 'all') => void;
  setError: (error: string) => void;
  install: (release: ReleaseInfo, force?: boolean) => Promise<void>;
  runAction: (
    action: () => Promise<unknown>,
    successToast?: Pick<ShowToastOptions, 'title' | 'description'>,
    source?: string,
  ) => Promise<void>;
  markReleasesReachable: () => void;
  showError: (cause: unknown, source?: string) => void;
  refreshAll: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const { status, serviceBusy, onActivate } = useServiceControls({
    onError: showError,
    refreshAll,
  });
  return (
    <VersionsPage
      versions={versions}
      latestTag={latestTag}
      libraryPath={libraryPath}
      shortenPaths
      releasesOnline={releasesNetwork !== 'offline'}
      networkStatus={releasesNetwork}
      networkError={releasesNetworkError}
      busy={busy}
      error={error}
      installingTag={installingTag}
      downloadRatio={downloadRatio}
      isAdmin={Boolean(status?.isAdmin)}
      activeStrategy={status?.activeStrategy}
      activateBusy={serviceBusy}
      view={versionsTab}
      onViewChange={setVersionsTab}
      onClearError={() => setError('')}
      onInstall={install}
      onActivate={onActivate}
      onRemove={(tag) =>
        runAction(
          () => api.removeVersion(tag),
          {
            title: t('toast.versionRemoved.title'),
            description: t('toast.versionRemoved.body', { tag }),
          },
          'library.removeVersion',
        )
      }
      onOpen={(path) => runAction(() => api.openDirectory(path), undefined, 'library.open')}
      onReleasesReachable={markReleasesReachable}
    />
  );
}

function AppShellConnected({
  page,
  onPage,
  installedCount,
  syncing,
  latestTag,
  latestInstalled,
  onOpenLatestVersion,
  children,
  showError,
  refreshAll,
}: {
  page: PageKey;
  onPage: (page: PageKey) => void;
  installedCount: number;
  syncing?: 'catalog' | 'download';
  latestTag?: string;
  latestInstalled: boolean;
  onOpenLatestVersion: () => void;
  children: React.ReactNode;
  showError: (cause: unknown, source?: string) => void;
  refreshAll: () => Promise<void>;
}) {
  const { status } = useServiceStatusState();
  const { onAdmin } = useServiceControls({ onError: showError, refreshAll });
  return (
    <AppShell
      page={page}
      onPage={onPage}
      status={status}
      installedCount={installedCount}
      syncing={syncing}
      latestTag={latestTag}
      latestInstalled={latestInstalled}
      onOpenLatestVersion={onOpenLatestVersion}
      onRelaunchAsAdmin={onAdmin}
    >
      {children}
    </AppShell>
  );
}

const AppBody = memo(function AppBody() {
  const { t, translateError, bootstrappedSettings } = useTranslation();
  const { showToast } = useToast();
  const { setMode } = useColorScheme();
  const { applyStatus, setPollingEnabled } = useServiceStatusApi();
  const [page, setPage] = useState<PageKey>('overview');
  const [versionsTab, setVersionsTab] = useState<'installed' | 'all'>('installed');
  const [settings, setSettings] = useState<AppSettings>();
  const [versions, setVersions] = useState<InstalledVersion[]>([]);
  const [busy, setBusy] = useState(false);
  const [installingTag, setInstallingTag] = useState<string>();
  const [downloadRatio, setDownloadRatio] = useState<number>();
  const [error, setError] = useState('');
  const [releasesNetwork, setReleasesNetwork] = useState<'ok' | 'offline' | 'unreachable'>('ok');
  const [releasesNetworkError, setReleasesNetworkError] = useState<string>();
  const [catalogLoading, setCatalogLoading] = useState(true);
  const settingsRef = useRef(settings);
  const translateErrorRef = useRef(translateError);
  const tRef = useRef(t);
  const showToastRef = useRef(showToast);
  const bootstrappedRef = useRef(false);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    translateErrorRef.current = translateError;
    tRef.current = t;
    showToastRef.current = showToast;
  }, [translateError, t, showToast]);

  useEffect(() => {
    setPollingEnabled(Boolean(settings));
  }, [settings, setPollingEnabled]);

  const openAllVersions = useCallback(() => {
    setError('');
    setVersionsTab('all');
    setPage('versions');
  }, []);

  const showError = useCallback((cause: unknown, source = 'app') => {
    const raw = String(cause);
    reportCaughtError(cause, {
      source,
      translate: translateErrorRef.current,
    });
    setError(raw);
    showToastRef.current({
      title: tRef.current('toast.error.title'),
      description: translateErrorRef.current(raw) || tRef.current('toast.error.body'),
      severity: 'error',
    });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [nextVersions, nextStatus] = await Promise.all([api.versions(), api.status()]);
      setVersions(nextVersions);
      applyStatus(nextStatus);
    } catch (cause) {
      showError(cause, 'app.refresh');
    }
  }, [showError, applyStatus]);

  const refreshCatalog = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const previousTag = settingsRef.current?.cachedLatestTag;
      const catalog = await api.refreshReleaseCatalog();
      if (catalog.fromCache) {
        setReleasesNetwork(navigator.onLine ? 'unreachable' : 'offline');
        setReleasesNetworkError(catalog.error);
        if (catalog.error) {
          reportCaughtError(catalog.error, {
            source: 'releases.catalog',
            translate: translateErrorRef.current,
          });
        }
      } else {
        setReleasesNetwork('ok');
        setReleasesNetworkError(undefined);
        if (catalog.isNewerThanInstalled && (!previousTag || previousTag !== catalog.latestTag)) {
          showToastRef.current({
            title: tRef.current('toast.newVersionAvailable.title'),
            description: tRef.current('toast.newVersionAvailable.body', {
              tag: catalog.latestTag,
            }),
            severity: 'info',
            duration: 12000,
            action: {
              label: tRef.current('toast.install'),
              onClick: openAllVersions,
            },
          });
        }
      }
      setSettings((prev) =>
        prev
          ? {
              ...prev,
              cachedLatestTag: catalog.latestTag,
            }
          : prev,
      );
    } catch (cause) {
      setReleasesNetwork(navigator.onLine ? 'unreachable' : 'offline');
      setReleasesNetworkError(String(cause));
      reportCaughtError(cause, {
        source: 'releases.catalog',
        translate: translateErrorRef.current,
      });
    } finally {
      setCatalogLoading(false);
    }
  }, [openAllVersions]);

  useEffect(() => installGlobalErrorHandlers(), []);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    if (!bootstrappedSettings) return;
    bootstrappedRef.current = true;
    let cancelled = false;
    setSettings(bootstrappedSettings);
    settingsRef.current = bootstrappedSettings;
    setMode(normalizeThemeMode(bootstrappedSettings.theme));
    void Promise.all([refresh(), refreshCatalog()]).catch((cause) => {
      if (!cancelled) showError(cause);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot bootstrap from i18n
  }, [bootstrappedSettings]);

  useEffect(() => {
    if (bootstrappedRef.current || bootstrappedSettings) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (bootstrappedRef.current || cancelled) return;
      api
        .settings()
        .then(async (initial) => {
          if (cancelled || bootstrappedRef.current) return;
          bootstrappedRef.current = true;
          setSettings(initial);
          settingsRef.current = initial;
          setMode(normalizeThemeMode(initial.theme));
          await Promise.all([refresh(), refreshCatalog()]);
        })
        .catch((cause) => {
          if (!cancelled) showError(cause);
        });
    }, 800);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- delayed fallback if i18n never yields settings
  }, [bootstrappedSettings]);

  useEffect(() => {
    if (!settings) return;
    setMode(normalizeThemeMode(settings.theme));
  }, [settings, setMode]);

  useEffect(() => {
    const onOnline = () => void refreshCatalog();
    const onOffline = () => {
      if (!navigator.onLine) setReleasesNetwork('offline');
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [refreshCatalog]);

  useEffect(() => {
    if (!import.meta.env.DEV && page === 'logs') setPage('overview');
  }, [page]);

  useEffect(() => {
    const root = document.documentElement;
    const allowSelect = page === 'logs';
    if (allowSelect) root.setAttribute('data-allow-text-select', '');
    else root.removeAttribute('data-allow-text-select');
    const onContextMenu = (event: MouseEvent) => {
      if (!allowSelect) event.preventDefault();
    };
    document.addEventListener('contextmenu', onContextMenu);
    return () => {
      document.removeEventListener('contextmenu', onContextMenu);
      root.removeAttribute('data-allow-text-select');
    };
  }, [page]);

  const saveSettings = useCallback(
    async (
      next: AppSettings,
      toastKey: 'settingsSaved' | 'themeChanged' | 'languageChanged' = 'settingsSaved',
    ) => {
      await api.saveSettings(next);
      const saved = await api.settings();
      setSettings(saved);
      await refresh();
      showToast({
        title: t(`toast.${toastKey}.title`),
        description: t(`toast.${toastKey}.body`),
      });
    },
    [refresh, showToast, t],
  );

  const install = useCallback(
    async (release: ReleaseInfo, force = false) => {
      setBusy(true);
      setInstallingTag(release.tag);
      setDownloadRatio(undefined);
      setError('');
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const unlisten = await listen<{
          tag: string;
          downloaded: number;
          total?: number | null;
        }>('download-progress', (event) => {
          if (event.payload.tag !== release.tag) return;
          const total = event.payload.total ?? undefined;
          if (total && total > 0) {
            setDownloadRatio(Math.min(1, event.payload.downloaded / total));
          }
        });
        try {
          await api.install(release, force);
          await refresh();
          const key = force ? 'versionReinstalled' : 'versionDownloaded';
          showToast({
            title: t(`toast.${key}.title`),
            description: t(`toast.${key}.body`, { tag: release.tag }),
          });
        } finally {
          unlisten();
        }
      } catch (cause) {
        showError(cause, force ? 'library.reinstall' : 'library.install');
      } finally {
        setBusy(false);
        setInstallingTag(undefined);
        setDownloadRatio(undefined);
      }
    },
    [refresh, showError, showToast, t],
  );

  const runAction = useCallback(
    async (
      action: () => Promise<unknown>,
      successToast?: Pick<ShowToastOptions, 'title' | 'description'>,
      source = 'app.action',
    ) => {
      try {
        setError('');
        await action();
        await refresh();
        if (successToast) showToast(successToast);
      } catch (cause) {
        showError(cause, source);
      }
    },
    [refresh, showError, showToast],
  );

  const markReleasesReachable = useCallback(() => {
    setReleasesNetwork('ok');
    setReleasesNetworkError(undefined);
  }, []);

  const goToPage = useCallback((next: PageKey) => {
    setPage(next);
    setError('');
    if (next === 'versions') setVersionsTab('installed');
  }, []);

  const onSaveSettings = useCallback(
    (next: AppSettings, reason?: 'theme' | 'locale') =>
      saveSettings(
        next,
        reason === 'theme' ? 'themeChanged' : reason === 'locale' ? 'languageChanged' : 'settingsSaved',
      ),
    [saveSettings],
  );

  if (!settings) return null;

  const content =
    page === 'overview' ? (
      <OverviewRoute
        versions={versions}
        latestTag={settings.cachedLatestTag}
        showError={showError}
        refreshAll={refresh}
      />
    ) : page === 'versions' ? (
      <VersionsRoute
        versions={versions}
        latestTag={settings.cachedLatestTag}
        libraryPath={settings.libraryPath}
        releasesNetwork={releasesNetwork}
        releasesNetworkError={releasesNetworkError}
        busy={busy}
        error={error}
        installingTag={installingTag}
        downloadRatio={downloadRatio}
        versionsTab={versionsTab}
        setVersionsTab={setVersionsTab}
        setError={setError}
        install={install}
        runAction={runAction}
        markReleasesReachable={markReleasesReachable}
        showError={showError}
        refreshAll={refresh}
      />
    ) : page === 'logs' && import.meta.env.DEV ? (
      <LogsPage
        cachedLatestTag={settings.cachedLatestTag}
        onClearCachedLatestTag={async () => {
          await api.saveSettings({ ...settings, cachedLatestTag: undefined });
          const saved = await api.settings();
          setSettings(saved);
          showToast({
            title: t('toast.debug.title'),
            description: t('toast.debug.cachedLatestTagCleared.body'),
          });
        }}
      />
    ) : (
      <MemoSettingsPage settings={settings} onSave={onSaveSettings} />
    );

  return (
    <>
      <WindowChromeSync theme={settings.theme} />
      <AppShellConnected
        page={page}
        onPage={goToPage}
        installedCount={versions.length}
        syncing={busy ? 'download' : catalogLoading ? 'catalog' : undefined}
        latestTag={settings.cachedLatestTag}
        latestInstalled={versions.some((version) => version.tag === settings.cachedLatestTag)}
        onOpenLatestVersion={openAllVersions}
        showError={showError}
        refreshAll={refresh}
      >
        <PageTransition pageKey={page}>
          {error && page !== 'versions' && page !== 'logs' && (
            <Box sx={{ mb: 2 }}>
              <ErrorAlert
                message={t('error.generic')}
                details={error}
                onClose={() => setError('')}
              />
            </Box>
          )}
          {content}
        </PageTransition>
      </AppShellConnected>
    </>
  );
});

export function App() {
  return (
    <ThemeProvider theme={theme} defaultMode="system">
      <CssBaseline />
      <ToastProvider>
        <ServiceStatusProvider>
          <AppBody />
        </ServiceStatusProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
