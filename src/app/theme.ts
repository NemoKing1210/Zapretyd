import { createTheme } from '@mui/material/styles';
export const theme = createTheme({
  colorSchemes: { light: { palette: { primary: { main: '#245BDB' }, secondary: { main: '#006A63' }, background: { default: '#F8F9FC', paper: '#FFFFFF' } } }, dark: { palette: { primary: { main: '#B6C4FF' }, secondary: { main: '#74D7CA' }, background: { default: '#111318', paper: '#1C1F26' } } } },
  shape: { borderRadius: 16 }, typography: { fontFamily: 'Inter, Segoe UI, Arial, sans-serif', h3: { fontWeight: 700, letterSpacing: '-0.04em' }, h5: { fontWeight: 700 } },
  components: { MuiCard: { styleOverrides: { root: { boxShadow: 'none', border: '1px solid rgba(80, 90, 110, .16)' } } }, MuiButton: { defaultProps: { variant: 'contained', disableElevation: true } } }
});
