import { CssBaseline, ThemeProvider, Box } from '@mui/material';
import { useColorScheme } from '@mui/material/styles';
import { useCallback, useEffect, useState } from 'react';
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
import { PageTransition } from '../shared/ui/PageTransition';
import { ErrorAlert } from '../shared/ui/ErrorAlert';
import { ToastProvider, useToast } from '../shared/ui/toast';
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
  const showError = useCallback(
    (cause: unknown) => {
      const raw = String(cause);
      reportCaughtError(cause, { source: 'app', translate: translateError });
      setError(raw);
      showToast({ message: t('error.generic'), severity: 'error' });
    },
    [showToast, t, translateError],
  );
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
      const catalog = await api.refreshReleaseCatalog();
      if (catalog.fromCache) {
        setReleasesNetwork(navigator.onLine ? 'unreachable' : 'offline');
        setReleasesNetworkError(catalog.error);
        if (catalog.error) {
          reportCaughtError(catalog.error, {
            source: 'releases.catalog',
            translate: translateError,
          });
        }
      } else {
        setReleasesNetwork('ok');
        setReleasesNetworkError(undefined);
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
      reportCaughtError(cause, { source: 'releases.catalog', translate: translateError });
    } finally {
      setCatalogLoading(false);
    }
  }, [translateError]);
  useEffect(() => installGlobalErrorHandlers(), []);
  useEffect(() => {
    api.defaultLibraryPath().then(setDefaultLibraryPath).catch(() => undefined);
    api.settings()
      .then(async (initial) => {
        setSettings(initial);
        setMode(normalizeThemeMode(initial.theme));
        await refreshCatalog();
      })
      .catch(showError);
    refresh();
  }, [refresh, refreshCatalog, setMode, showError]);
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
    refresh();
    // Re-run only when the library path changes, not on every settings/callback identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional libraryPath-only deps
  }, [settings?.libraryPath]);
  useEffect(() => {
    if (!import.meta.env.DEV && page === 'logs') setPage('overview');
  }, [page]);
  const saveSettings = async (
    next: AppSettings,
    toastKey: 'toast.settingsSaved' | 'toast.libraryConfigured' = 'toast.settingsSaved',
  ) => {
    await api.saveSettings(next);
    setSettings(next);
    await refresh();
    showToast(t(toastKey));
  };
  const install = async (release: ReleaseInfo, force = false) => {
    setBusy(true);
    setInstallingTag(release.tag);
    setError('');
    try {
      await api.install(release, force);
      await refresh();
      showToast(
        t(force ? 'toast.versionReinstalled' : 'toast.versionDownloaded', { tag: release.tag }),
      );
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(false);
      setInstallingTag(undefined);
    }
  };
  const runAction = async (action: () => Promise<unknown>, successMessage?: string) => {
    try {
      setError('');
      await action();
      await refresh();
      if (successMessage) showToast(successMessage);
    } catch (cause) {
      showError(cause);
    }
  };
  const serviceAction = async (action: () => Promise<unknown>, successMessage?: string) => {
    setServiceBusy(true);
    try {
      await runAction(action, successMessage);
    } finally {
      setServiceBusy(false);
    }
  };
  const markReleasesReachable = useCallback(() => {
    setReleasesNetwork('ok');
    setReleasesNetworkError(undefined);
  }, []);
  if (!settings) return null;
  const useAppLibrary = Boolean(
    defaultLibraryPath && settings.libraryPath === defaultLibraryPath,
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
          serviceAction(() => api.activate(strategy), t('toast.serviceActivated'))
        }
        onStop={() => serviceAction(api.stop, t('toast.serviceStopped'))}
        onRemove={() => serviceAction(api.removeService, t('toast.serviceRemoved'))}
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
        onInstall={install}
        onRemove={(tag) =>
          runAction(() => api.removeVersion(tag), t('toast.versionRemoved', { tag }))
        }
        onOpen={(path) => runAction(() => api.openDirectory(path))}
        onReleasesReachable={markReleasesReachable}
      />
    ) : page === 'logs' && import.meta.env.DEV ? (
      <LogsPage />
    ) : (
      <SettingsPage settings={settings} onSave={(next) => saveSettings(next)} />
    );
  return (
    <>
      <WindowChromeSync theme={settings.theme} />
      <AppShell
        page={page}
        onPage={setPage}
        status={status}
        installedCount={versions.length}
        syncing={busy ? 'download' : catalogLoading ? 'catalog' : undefined}
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
          saveSettings({ ...settings, libraryPath }, 'toast.libraryConfigured')
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
