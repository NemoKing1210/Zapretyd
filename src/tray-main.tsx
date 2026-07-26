import { CssBaseline, GlobalStyles, ThemeProvider } from '@mui/material';
import { createRoot } from 'react-dom/client';
import { theme } from './app/theme';
import { TrayMenuApp } from './features/tray-menu/ui/TrayMenuApp';
import { I18nProvider } from './shared/i18n';

createRoot(document.getElementById('root')!).render(
  <I18nProvider>
    <ThemeProvider theme={theme} defaultMode="system">
      <CssBaseline />
      <GlobalStyles
        styles={{
          'html, body, #root': {
            backgroundColor: 'transparent !important',
            background: 'transparent !important',
          },
        }}
      />
      <TrayMenuApp />
    </ThemeProvider>
  </I18nProvider>,
);
