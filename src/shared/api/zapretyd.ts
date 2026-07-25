import { invoke } from '@tauri-apps/api/core';
import { openUrl as openerOpenUrl } from '@tauri-apps/plugin-opener';

export type ThemeMode = 'system' | 'light' | 'dark';

export type AppSettings = {
  libraryPath?: string;
  lastUpdateCheck?: string;
  latestEtag?: string;
  theme: string;
  locale?: string;
  cachedLatestTag?: string;
  autostart?: boolean;
  startMinimized?: boolean;
};

export function normalizeThemeMode(theme: string | undefined): ThemeMode {
  return theme === 'light' || theme === 'dark' || theme === 'system' ? theme : 'system';
}
export type ReleaseCatalog = {
  latestTag: string;
  fromCache: boolean;
  isNewerThanInstalled: boolean;
  error?: string;
};
export type ReleaseInfo = {
  tag: string;
  name: string;
  publishedAt: string;
  downloadUrl: string;
  assetName: string;
  size: number;
  isNewerThanInstalled: boolean;
  body?: string;
  htmlUrl?: string;
  prerelease: boolean;
};
export type ReleasePage = {
  releases: ReleaseInfo[];
  page: number;
  hasMore: boolean;
};
export type InstalledVersion = {
  tag: string;
  path: string;
  installedAt: string;
  size: number;
  sha256: string;
  isActive: boolean;
};
export type StrategyInfo = { name: string; path: string; version: string };
export type ListFileInfo = {
  name: string;
  size: number;
  deleted: boolean;
  hasOriginal: boolean;
};
export type ServiceStatus = {
  isAdmin: boolean;
  serviceExists: boolean;
  serviceRunning: boolean;
  windivertRunning: boolean;
  winwsRunning: boolean;
  activeStrategy?: string;
  messageCode: string;
};
export const api = {
  settings: () => invoke<AppSettings>('get_settings'),
  saveSettings: (settings: AppSettings) => invoke<void>('save_settings', { settings }),
  systemLocale: () => invoke<string>('get_system_locale'),
  isAdmin: () => invoke<boolean>('is_administrator'),
  relaunchAsAdmin: () => invoke<void>('relaunch_as_admin'),
  latest: () => invoke<ReleaseInfo>('check_latest_release'),
  refreshReleaseCatalog: () => invoke<ReleaseCatalog>('refresh_release_catalog'),
  listReleases: (page: number) => invoke<ReleasePage>('list_releases', { page }),
  getRelease: (tag: string) => invoke<ReleaseInfo>('get_release', { tag }),
  versions: () => invoke<InstalledVersion[]>('list_installed_versions'),
  install: (release: ReleaseInfo, force = false) =>
    invoke<InstalledVersion>('install_release', { release, force }),
  removeVersion: (tag: string) => invoke<void>('remove_version', { tag }),
  strategies: (tag: string) => invoke<StrategyInfo[]>('get_strategies', { tag }),
  listVersionListFiles: (tag: string) =>
    invoke<ListFileInfo[]>('list_version_list_files', { tag }),
  readVersionListFile: (tag: string, name: string) =>
    invoke<string>('read_version_list_file', { tag, name }),
  writeVersionListFile: (tag: string, name: string, content: string) =>
    invoke<void>('write_version_list_file', { tag, name, content }),
  deleteVersionListFile: (tag: string, name: string) =>
    invoke<void>('delete_version_list_file', { tag, name }),
  restoreVersionListFile: (tag: string, name: string) =>
    invoke<void>('restore_version_list_file', { tag, name }),
  openDirectory: (path: string) => invoke<void>('open_directory', { path }),
  openUrl: (url: string) => openerOpenUrl(url),
  appendErrorLogs: (
    entries: Array<{ message: string; raw: string; source: string; at: number }>,
  ) => invoke<void>('append_error_logs', { entries }),
  logsDir: () => invoke<string>('get_logs_dir'),
  openLogsDirectory: () => invoke<void>('open_logs_directory'),
  clearErrorLogs: () => invoke<void>('clear_error_logs'),
  status: () => invoke<ServiceStatus>('get_service_status'),
  activate: (strategy: StrategyInfo) => invoke<void>('activate_strategy', { strategy }),
  start: () => invoke<void>('start_service'),
  stop: () => invoke<void>('stop_service'),
  removeService: () => invoke<void>('remove_service'),
  syncWindowChrome: (dark: boolean) => invoke<void>('sync_window_chrome', { dark }),
};
