import { CssBaseline, ThemeProvider } from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import { api, type AppSettings, type InstalledVersion, type ReleaseInfo, type ServiceStatus, type StrategyInfo } from '../shared/api/zapretyd';
import { useTranslation } from '../shared/i18n';
import { theme } from './theme'; import { AppShell, type PageKey } from '../widgets/app-shell/ui/AppShell'; import { LibraryPathDialog } from '../features/library-path/ui/LibraryPathDialog'; import { OverviewPage } from '../pages/overview/ui/OverviewPage'; import { VersionsPage } from '../pages/versions/ui/VersionsPage'; import { ServicePage } from '../pages/service/ui/ServicePage'; import { SettingsPage } from '../pages/settings/ui/SettingsPage';

export function App() {
  const { translateError } = useTranslation();
  const [page, setPage] = useState<PageKey>('overview'); const [settings, setSettings] = useState<AppSettings>(); const [versions, setVersions] = useState<InstalledVersion[]>([]); const [status, setStatus] = useState<ServiceStatus>(); const [latest, setLatest] = useState<ReleaseInfo>(); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const showError = useCallback((cause: unknown) => setError(translateError(String(cause))), [translateError]);
  const refresh = useCallback(async () => { try { const [nextVersions, nextStatus] = await Promise.all([api.versions(), api.status()]); setVersions(nextVersions); setStatus(nextStatus); } catch (cause) { showError(cause); } }, [showError]);
  const check = useCallback(async () => { setBusy(true); setError(''); try { setLatest(await api.latest()); } catch (cause) { showError(cause); } finally { setBusy(false); } }, [showError]);
  useEffect(() => { api.settings().then(setSettings).catch(showError); refresh(); }, [refresh, showError]);
  useEffect(() => { if (!settings?.libraryPath) return; refresh(); if (settings.autoCheckUpdates) { const last = settings.lastUpdateCheck ? Date.parse(settings.lastUpdateCheck) : 0; if (Date.now() - last > 86_400_000) void check(); } }, [settings?.libraryPath]);
  const saveSettings = async (next: AppSettings) => { await api.saveSettings(next); setSettings(next); await refresh(); };
  const install = async () => { if (!latest) return; setBusy(true); try { await api.install(latest); await refresh(); setLatest({ ...latest, isNewerThanInstalled: false }); } catch (cause) { showError(cause); } finally { setBusy(false); } };
  const serviceAction = async (action: () => Promise<unknown>) => { try { setError(''); await action(); await refresh(); } catch (cause) { showError(cause); } };
  if (!settings) return null;
  const content = page === 'overview' ? <OverviewPage status={status} onService={() => setPage('service')} /> : page === 'versions' ? <VersionsPage versions={versions} latest={latest} busy={busy} error={error} onCheck={check} onInstall={install} onRemove={(tag) => serviceAction(() => api.removeVersion(tag))} onOpen={(path) => serviceAction(() => api.openDirectory(path))} /> : page === 'service' ? <ServicePage status={status} versions={versions} loadStrategies={api.strategies} onActivate={(strategy) => serviceAction(() => api.activate(strategy))} onStop={() => serviceAction(api.stop)} onRemove={() => serviceAction(api.removeService)} onAdmin={() => serviceAction(api.relaunchAsAdmin)} /> : <SettingsPage settings={settings} onSave={saveSettings} />;
  return <ThemeProvider theme={theme} defaultMode="system"><CssBaseline /><AppShell page={page} onPage={setPage}>{error && page !== 'versions' && <div role="alert" style={{ color: '#ba1a1a', marginBottom: 16 }}>{error}</div>}{content}</AppShell><LibraryPathDialog settings={settings} onSave={async (libraryPath) => saveSettings({ ...settings, libraryPath })} /></ThemeProvider>;
}
