import { createTheme } from '@mui/material/styles';
export const theme = createTheme({
  colorSchemes: {
    light: {
      palette: {
        primary: { main: '#245BDB' },
        secondary: { main: '#006A63' },
        error: { main: '#9B1B1B' },
        background: { default: '#F8F9FC', paper: '#FFFFFF' },
      },
    },
    dark: {
      palette: {
        primary: { main: '#B6C4FF' },
        secondary: { main: '#74D7CA' },
        error: { main: '#C62828' },
        background: { default: '#111318', paper: '#1C1F26' },
      },
    },
  },
  shape: { borderRadius: 16 },
  typography: {
    fontFamily: 'Inter, Segoe UI, Arial, sans-serif',
    h3: { fontWeight: 700, letterSpacing: '-0.04em' },
    h5: { fontWeight: 700 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        'html, body, #root': {
          userSelect: 'none',
          WebkitUserSelect: 'none',
        },
        'input, textarea, [contenteditable="true"], .cm-editor, .cm-content, .cm-line': {
          userSelect: 'text',
          WebkitUserSelect: 'text',
        },
        'html[data-allow-text-select], html[data-allow-text-select] body, html[data-allow-text-select] #root':
          {
            userSelect: 'text',
            WebkitUserSelect: 'text',
          },
      },
    },
    MuiCard: {
      styleOverrides: { root: { boxShadow: 'none', border: '1px solid rgba(80, 90, 110, .16)' } },
    },
    MuiButton: { defaultProps: { variant: 'contained', disableElevation: true } },
  },
});
