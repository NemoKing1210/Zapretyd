import { DashboardOutlined, FolderOpenOutlined, SettingsOutlined, StorageOutlined } from '@mui/icons-material';
import { Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText, Toolbar, Typography, AppBar } from '@mui/material';
import { useTranslation } from '../../../shared/i18n';

const navigation = [
  { key: 'overview', labelKey: 'nav.overview' as const, icon: <DashboardOutlined /> },
  { key: 'versions', labelKey: 'nav.versions' as const, icon: <FolderOpenOutlined /> },
  { key: 'service', labelKey: 'nav.service' as const, icon: <StorageOutlined /> },
  { key: 'settings', labelKey: 'nav.settings' as const, icon: <SettingsOutlined /> },
];
export type PageKey = typeof navigation[number]['key'];
export function AppShell({ page, onPage, children }: { page: PageKey; onPage: (page: PageKey) => void; children: React.ReactNode }) {
  const { t } = useTranslation();
  return <Box sx={{ display: 'flex', minHeight: '100vh' }}><AppBar position="fixed" color="transparent" elevation={0} sx={{ borderBottom: '1px solid rgba(80,90,110,.14)', backdropFilter: 'blur(12px)' }}><Toolbar><Typography variant="h6" fontWeight={800} letterSpacing="-.04em">Zapretyd</Typography><Typography variant="body2" color="text.secondary" sx={{ ml: 1.5 }}>{t('app.subtitle')}</Typography></Toolbar></AppBar><Drawer variant="permanent" sx={{ width: 240, flexShrink: 0, '& .MuiDrawer-paper': { width: 240, boxSizing: 'border-box', border: 0, pt: 8 } }}><List>{navigation.map((item) => <ListItemButton key={item.key} selected={page === item.key} onClick={() => onPage(item.key)} sx={{ mx: 1, borderRadius: 2 }}><ListItemIcon>{item.icon}</ListItemIcon><ListItemText primary={t(item.labelKey)} /></ListItemButton>)}</List></Drawer><Box component="main" sx={{ flex: 1, p: { xs: 3, md: 5 }, pt: { xs: 12, md: 13 }, maxWidth: 1440 }}>{children}</Box></Box>;
}
