import { invoke } from '@tauri-apps/api/core';

export type AppSettings = {
  libraryPath?: string;
  autoCheckUpdates: boolean;
  lastUpdateCheck?: string;
  latestEtag?: string;
  theme: string;
};
export type ReleaseInfo = {
  tag: string;
  name: string;
  publishedAt: string;
  downloadUrl: string;
  assetName: string;
  size: number;
  isNewerThanInstalled: boolean;
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
  versions: () => invoke<InstalledVersion[]>('list_installed_versions'),
  install: (release: ReleaseInfo) => invoke<InstalledVersion>('install_release', { release }),
  removeVersion: (tag: string) => invoke<void>('remove_version', { tag }),
  strategies: (tag: string) => invoke<StrategyInfo[]>('get_strategies', { tag }),
  openDirectory: (path: string) => invoke<void>('open_directory', { path }),
  status: () => invoke<ServiceStatus>('get_service_status'),
  activate: (strategy: StrategyInfo) => invoke<void>('activate_strategy', { strategy }),
  stop: () => invoke<void>('stop_service'),
  removeService: () => invoke<void>('remove_service'),
};
