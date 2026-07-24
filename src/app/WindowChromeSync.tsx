import { useColorScheme } from '@mui/material/styles';
import { useEffect } from 'react';
import { api } from '../shared/api/zapretyd';

/** Keep the native window title bar in sync with the app color scheme. */
export function WindowChromeSync() {
  const { mode, systemMode } = useColorScheme();
  const resolved = mode === 'system' ? systemMode : mode;

  useEffect(() => {
    if (!resolved) return;
    void api.syncWindowChrome(resolved === 'dark');
  }, [resolved]);

  return null;
}
