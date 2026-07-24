import { CssBaseline, ThemeProvider } from '@mui/material';
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
import { PageTransition } from '../shared/ui/PageTransition';
import { theme } from './theme';
import { WindowChromeSync } from './WindowChromeSync';
import { AppShell, type PageKey } from '../widgets/app-shell/ui/AppShell';
import { LibraryPathDialog } from '../features/library-path/ui/LibraryPathDialog';
import { OverviewPage } from '../pages/overview/ui/OverviewPage';
import { VersionsPage } from '../pages/versions/ui/VersionsPage';
import { SettingsPage } from '../pages/settings/ui/SettingsPage';

export function App() {
  const { translateError } = useTranslation();
  const [page, setPage] = useState<PageKey>('overview');
  const [settings, setSettings] = useState<AppSettings>();
  const [versions, setVersions] = useState<InstalledVersion[]>([]);
  const [status, setStatus] = useState<ServiceStatus>();
  const [busy, setBusy] = useState(false);
  const [installingTag, setInstallingTag] = useState<string>();
  const [serviceBusy, setServiceBusy] = useState(false);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(true);
  const showError = useCallback(
    (cause: unknown) => setError(translateError(String(cause))),
    [translateError],
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
    try {
      const catalog = await api.refreshReleaseCatalog();
      setOnline(!catalog.fromCache);
      setSettings((prev) =>
        prev
          ? {
              ...prev,
              cachedLatestTag: catalog.latestTag,
              cachedReleaseCount: catalog.releaseCount,
            }
          : prev,
      );
    } catch {
      setOnline(false);
    }
  }, []);
  useEffect(() => {
    api.settings()
      .then(async (initial) => {
        setSettings(initial);
        await refreshCatalog();
      })
      .catch(showError);
    refresh();
  }, [refresh, refreshCatalog, showError]);
  useEffect(() => {
    const onOnline = () => void refreshCatalog();
    const onOffline = () => setOnline(false);
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
  const saveSettings = async (next: AppSettings) => {
    await api.saveSettings(next);
    setSettings(next);
    await refresh();
  };
  const install = async (release: ReleaseInfo, force = false) => {
    setBusy(true);
    setInstallingTag(release.tag);
    setError('');
    try {
      await api.install(release, force);
      await refresh();
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(false);
      setInstallingTag(undefined);
    }
  };
  const runAction = async (action: () => Promise<unknown>) => {
    try {
      setError('');
      await action();
      await refresh();
    } catch (cause) {
      showError(cause);
    }
  };
  const serviceAction = async (action: () => Promise<unknown>) => {
    setServiceBusy(true);
    try {
      await runAction(action);
    } finally {
      setServiceBusy(false);
    }
  };
  if (!settings) return null;
  const content =
    page === 'overview' ? (
      <OverviewPage
        status={status}
        versions={versions}
        latestTag={settings.cachedLatestTag}
        serviceBusy={serviceBusy}
        loadStrategies={api.strategies}
        onActivate={(strategy) => serviceAction(() => api.activate(strategy))}
        onStop={() => serviceAction(api.stop)}
        onRemove={() => serviceAction(api.removeService)}
        onAdmin={() => serviceAction(api.relaunchAsAdmin)}
        onStrategiesError={showError}
      />
    ) : page === 'versions' ? (
      <VersionsPage
        versions={versions}
        latestTag={settings.cachedLatestTag}
        releaseCount={settings.cachedReleaseCount}
        online={online}
        busy={busy}
        error={error}
        installingTag={installingTag}
        onInstall={install}
        onRemove={(tag) => runAction(() => api.removeVersion(tag))}
        onOpen={(path) => runAction(() => api.openDirectory(path))}
      />
    ) : (
      <SettingsPage settings={settings} onSave={saveSettings} />
    );
  return (
    <ThemeProvider theme={theme} defaultMode={normalizeThemeMode(settings.theme)}>
      <CssBaseline />
      <WindowChromeSync theme={settings.theme} />
      <AppShell page={page} onPage={setPage} status={status} installedCount={versions.length}>
        <PageTransition pageKey={page}>
          {error && page !== 'versions' && (
            <div role="alert" style={{ color: '#ba1a1a', marginBottom: 16 }}>
              {error}
            </div>
          )}
          {content}
        </PageTransition>
      </AppShell>
      <LibraryPathDialog
        settings={settings}
        onSave={async (libraryPath) => saveSettings({ ...settings, libraryPath })}
      />
    </ThemeProvider>
  );
}
