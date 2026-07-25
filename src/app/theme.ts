import { createTheme } from '@mui/material/styles';

const scrollbarVars = {
  light: {
    thumb: 'rgba(80, 90, 110, 0.28)',
    thumbHover: 'rgba(36, 91, 219, 0.45)',
    thumbActive: 'rgba(36, 91, 219, 0.6)',
  },
  dark: {
    thumb: 'rgba(182, 196, 255, 0.22)',
    thumbHover: 'rgba(182, 196, 255, 0.4)',
    thumbActive: 'rgba(182, 196, 255, 0.55)',
  },
} as const;

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
        ':root, [data-mui-color-scheme="light"]': {
          '--zapretyd-scrollbar-thumb': scrollbarVars.light.thumb,
          '--zapretyd-scrollbar-thumb-hover': scrollbarVars.light.thumbHover,
          '--zapretyd-scrollbar-thumb-active': scrollbarVars.light.thumbActive,
        },
        '[data-mui-color-scheme="dark"]': {
          '--zapretyd-scrollbar-thumb': scrollbarVars.dark.thumb,
          '--zapretyd-scrollbar-thumb-hover': scrollbarVars.dark.thumbHover,
          '--zapretyd-scrollbar-thumb-active': scrollbarVars.dark.thumbActive,
        },
        '*': {
          scrollbarWidth: 'thin',
          scrollbarColor: 'var(--zapretyd-scrollbar-thumb) transparent',
        },
        '*::-webkit-scrollbar': {
          width: 10,
          height: 10,
        },
        '*::-webkit-scrollbar-corner': {
          background: 'transparent',
        },
        '*::-webkit-scrollbar-track': {
          background: 'transparent',
        },
        '*::-webkit-scrollbar-thumb': {
          backgroundColor: 'var(--zapretyd-scrollbar-thumb)',
          borderRadius: 999,
          border: '2px solid transparent',
          backgroundClip: 'padding-box',
        },
        '*::-webkit-scrollbar-thumb:hover': {
          backgroundColor: 'var(--zapretyd-scrollbar-thumb-hover)',
        },
        '*::-webkit-scrollbar-thumb:active': {
          backgroundColor: 'var(--zapretyd-scrollbar-thumb-active)',
        },
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
