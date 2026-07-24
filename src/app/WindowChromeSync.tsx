import { useColorScheme } from '@mui/material/styles';
import { useEffect } from 'react';
import { api, normalizeThemeMode } from '../shared/api/zapretyd';

/** Keep MUI color mode and the native window title bar in sync with saved settings. */
export function WindowChromeSync({ theme }: { theme: string }) {
  const { mode, systemMode, setMode } = useColorScheme();
  const preferred = normalizeThemeMode(theme);
  const resolved = preferred === 'system' ? systemMode : preferred;

  useEffect(() => {
    if (mode !== preferred) setMode(preferred);
  }, [mode, preferred, setMode]);

  useEffect(() => {
    if (!resolved) return;
    void api.syncWindowChrome(resolved === 'dark');
  }, [resolved]);

  return null;
}
