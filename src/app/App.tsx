import { CssBaseline, ThemeProvider, Box } from '@mui/material';
import { useColorScheme } from '@mui/material/styles';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  normalizeThemeMode,
  type AppSettings,
  type InstalledVersion,
  type ReleaseInfo,
  type ServiceStatus,
} from '../shared/api/zapretyd';
import { useTranslation } from '../shared/i18n';
import {
  installGlobalErrorHandlers,
  reportCaughtError,
} from '../shared/lib/errorLog';
import { pathsEqual } from '../shared/lib/format';
import { PageTransition } from '../shared/ui/PageTransition';
import { ErrorAlert } from '../shared/ui/ErrorAlert';
import { ToastProvider, useToast } from '../shared/ui/toast';
import type { ShowToastOptions } from '../shared/ui/toast';
import { theme } from './theme';
import { WindowChromeSync } from './WindowChromeSync';
import { AppShell, type PageKey } from '../widgets/app-shell/ui/AppShell';
import { LibraryPathDialog } from '../features/library-path/ui/LibraryPathDialog';
import { OverviewPage } from '../pages/overview/ui/OverviewPage';
import { VersionsPage } from '../pages/versions/ui/VersionsPage';
import { SettingsPage } from '../pages/settings/ui/SettingsPage';
import { LogsPage } from '../pages/logs/ui/LogsPage';

function AppBody() {
  const { t, translateError } = useTranslation();
  const { showToast } = useToast();
  const { setMode } = useColorScheme();
  const [page, setPage] = useState<PageKey>('overview');
  const [versionsTab, setVersionsTab] = useState<'installed' | 'all'>('installed');
  const [settings, setSettings] = useState<AppSettings>();
  const [versions, setVersions] = useState<InstalledVersion[]>([]);
  const [status, setStatus] = useState<ServiceStatus>();
  const [busy, setBusy] = useState(false);
  const [installingTag, setInstallingTag] = useState<string>();
  const [serviceBusy, setServiceBusy] = useState(false);
  const [error, setError] = useState('');
  const [releasesNetwork, setReleasesNetwork] = useState<'ok' | 'offline' | 'unreachable'>('ok');
  const [releasesNetworkError, setReleasesNetworkError] = useState<string>();
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [defaultLibraryPath, setDefaultLibraryPath] = useState<string>();
  const settingsRef = useRef(settings);
  const translateErrorRef = useRef(translateError);
  const tRef = useRef(t);
  const showToastRef = useRef(showToast);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    translateErrorRef.current = translateError;
    tRef.current = t;
    showToastRef.current = showToast;
  }, [translateError, t, showToast]);

  const openAllVersions = useCallback(() => {
    setVersionsTab('all');
    setPage('versions');
  }, []);

  const showError = useCallback((cause: unknown) => {
    const raw = String(cause);
    reportCaughtError(cause, {
      source: 'app',
      translate: translateErrorRef.current,
    });
    setError(raw);
    showToastRef.current({
      title: tRef.current('toast.error.title'),
      description: tRef.current('toast.error.body'),
      severity: 'error',
    });
  }, []);
  const refresh = useCallback(async () => {
    try {
      const [nextVersions, nextStatus] = await Promise.all([api.versions(), api.status()]);
      setVersions(nextVersions);
      setStatus(nextStatus);
    } catch (cause) {
      showError(cause);
    }
  }, [showError]);
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
        if (!previousTag || previousTag !== catalog.latestTag) {
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
    let cancelled = false;
    api.defaultLibraryPath().then(setDefaultLibraryPath).catch(() => undefined);
    api.settings()
      .then(async (initial) => {
        if (cancelled) return;
        setSettings(initial);
        setMode(normalizeThemeMode(initial.theme));
        await refreshCatalog();
      })
      .catch((cause) => {
        if (!cancelled) showError(cause);
      });
    void refresh();
    return () => {
      cancelled = true;
    };
    // Mount-only bootstrap. Catalog refresh must not re-run when locale/theme settings change.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only bootstrap
  }, []);
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
    if (!settings?.libraryPath) return;
    void refresh();
    // Re-run only when the library path changes, not on every settings/callback identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional libraryPath-only deps
  }, [settings?.libraryPath]);
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
  const saveSettings = async (
    next: AppSettings,
    toastKey:
      | 'settingsSaved'
      | 'libraryConfigured'
      | 'libraryPathChanged'
      | 'themeChanged'
      | 'languageChanged' = 'settingsSaved',
  ) => {
    await api.saveSettings(next);
    setSettings(next);
    await refresh();
    showToast({
      title: t(`toast.${toastKey}.title`),
      description: t(`toast.${toastKey}.body`),
    });
  };
  const install = async (release: ReleaseInfo, force = false) => {
    setBusy(true);
    setInstallingTag(release.tag);
    setError('');
    try {
      await api.install(release, force);
      await refresh();
      const key = force ? 'versionReinstalled' : 'versionDownloaded';
      showToast({
        title: t(`toast.${key}.title`),
        description: t(`toast.${key}.body`, { tag: release.tag }),
      });
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(false);
      setInstallingTag(undefined);
    }
  };
  const runAction = async (
    action: () => Promise<unknown>,
    successToast?: Pick<ShowToastOptions, 'title' | 'description'>,
  ) => {
    try {
      setError('');
      await action();
      await refresh();
      if (successToast) showToast(successToast);
    } catch (cause) {
      showError(cause);
    }
  };
  const serviceAction = async (
    action: () => Promise<unknown>,
    successToast?: Pick<ShowToastOptions, 'title' | 'description'>,
  ) => {
    setServiceBusy(true);
    try {
      await runAction(action, successToast);
    } finally {
      setServiceBusy(false);
    }
  };
  const markReleasesReachable = useCallback(() => {
    setReleasesNetwork('ok');
    setReleasesNetworkError(undefined);
  }, []);
  const goToPage = useCallback((next: PageKey) => {
    setPage(next);
    if (next === 'versions') setVersionsTab('installed');
  }, []);
  if (!settings) return null;
  const useAppLibrary = Boolean(
    defaultLibraryPath && pathsEqual(settings.libraryPath, defaultLibraryPath),
  );
  const content =
    page === 'overview' ? (
      <OverviewPage
        status={status}
        versions={versions}
        latestTag={settings.cachedLatestTag}
        serviceBusy={serviceBusy}
        loadStrategies={api.strategies}
        onActivate={(strategy) =>
          serviceAction(() => api.activate(strategy), {
            title: t('toast.serviceActivated.title'),
            description: t('toast.serviceActivated.body'),
          })
        }
        onStop={() =>
          serviceAction(api.stop, {
            title: t('toast.serviceStopped.title'),
            description: t('toast.serviceStopped.body'),
          })
        }
        onRemove={() =>
          serviceAction(api.removeService, {
            title: t('toast.serviceRemoved.title'),
            description: t('toast.serviceRemoved.body'),
          })
        }
        onAdmin={() => serviceAction(api.relaunchAsAdmin)}
        onStrategiesError={showError}
      />
    ) : page === 'versions' ? (
      <VersionsPage
        versions={versions}
        latestTag={settings.cachedLatestTag}
        libraryPath={settings.libraryPath}
        shortenPaths={useAppLibrary}
        releasesOnline={releasesNetwork !== 'offline'}
        networkStatus={releasesNetwork}
        networkError={releasesNetworkError}
        busy={busy}
        error={error}
        installingTag={installingTag}
        view={versionsTab}
        onViewChange={setVersionsTab}
        onInstall={install}
        onRemove={(tag) =>
          runAction(() => api.removeVersion(tag), {
            title: t('toast.versionRemoved.title'),
            description: t('toast.versionRemoved.body', { tag }),
          })
        }
        onOpen={(path) => runAction(() => api.openDirectory(path))}
        onReleasesReachable={markReleasesReachable}
      />
    ) : page === 'logs' && import.meta.env.DEV ? (
      <LogsPage
        cachedLatestTag={settings.cachedLatestTag}
        onClearCachedLatestTag={async () => {
          const next = { ...settings, cachedLatestTag: undefined };
          await api.saveSettings(next);
          setSettings(next);
          showToast({
            title: t('toast.debug.title'),
            description: t('toast.debug.cachedLatestTagCleared.body'),
          });
        }}
      />
    ) : (
      <SettingsPage
        settings={settings}
        defaultLibraryPath={defaultLibraryPath}
        onSave={(next, reason) =>
          saveSettings(
            next,
            reason === 'theme'
              ? 'themeChanged'
              : reason === 'locale'
                ? 'languageChanged'
                : reason === 'library'
                  ? 'libraryPathChanged'
                  : 'settingsSaved',
          )
        }
      />
    );
  return (
    <>
      <WindowChromeSync theme={settings.theme} />
      <AppShell
        page={page}
        onPage={goToPage}
        status={status}
        installedCount={versions.length}
        syncing={busy ? 'download' : catalogLoading ? 'catalog' : undefined}
        latestTag={settings.cachedLatestTag}
        latestInstalled={versions.some((version) => version.tag === settings.cachedLatestTag)}
        onOpenLatestVersion={openAllVersions}
      >
        <PageTransition pageKey={page}>
          {error && page !== 'versions' && page !== 'logs' && (
            <Box sx={{ mb: 2 }}>
              <ErrorAlert message={t('error.generic')} details={error} />
            </Box>
          )}
          {content}
        </PageTransition>
      </AppShell>
      <LibraryPathDialog
        settings={settings}
        onSave={async (libraryPath) =>
          saveSettings({ ...settings, libraryPath }, 'libraryConfigured')
        }
      />
    </>
  );
}

export function App() {
  return (
    <ThemeProvider theme={theme} defaultMode="system">
      <CssBaseline />
      <ToastProvider>
        <AppBody />
      </ToastProvider>
    </ThemeProvider>
  );
}
