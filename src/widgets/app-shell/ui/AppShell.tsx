import {
  AdminPanelSettingsOutlined,
  DashboardOutlined,
  FolderOpenOutlined,
  SettingsOutlined,
  StorageOutlined,
} from '@mui/icons-material';
import {
  AppBar,
  Box,
  Chip,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import type { ServiceStatus } from '../../../shared/api/zapretyd';
import { useTranslation } from '../../../shared/i18n';

const DRAWER_WIDTH = 240;

const navigation = [
  { key: 'overview', labelKey: 'nav.overview' as const, icon: <DashboardOutlined /> },
  { key: 'versions', labelKey: 'nav.versions' as const, icon: <FolderOpenOutlined /> },
  { key: 'service', labelKey: 'nav.service' as const, icon: <StorageOutlined /> },
  { key: 'settings', labelKey: 'nav.settings' as const, icon: <SettingsOutlined /> },
];

export type PageKey = (typeof navigation)[number]['key'];

export function AppShell({
  page,
  onPage,
  status,
  children,
}: {
  page: PageKey;
  onPage: (page: PageKey) => void;
  status?: ServiceStatus;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const running = Boolean(status?.serviceRunning && status.winwsRunning);
  const appVersion = import.meta.env.VITE_APP_VERSION as string;

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar
        position="fixed"
        color="transparent"
        elevation={0}
        sx={{
          width: `calc(100% - ${DRAWER_WIDTH}px)`,
          ml: `${DRAWER_WIDTH}px`,
          borderBottom: '1px solid rgba(80,90,110,.14)',
          backdropFilter: 'blur(12px)',
          bgcolor: 'background.default',
          backgroundImage: 'none',
        }}
      >
        <Toolbar sx={{ gap: 1, justifyContent: 'flex-end', minHeight: { xs: 64 } }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Chip
              size="small"
              clickable
              onClick={() => onPage('service')}
              color={running ? 'success' : 'default'}
              variant={running ? 'filled' : 'outlined'}
              label={running ? t('shell.serviceRunning') : t('shell.serviceStopped')}
            />
            {status?.activeStrategy && (
              <Chip
                size="small"
                clickable
                onClick={() => onPage('service')}
                variant="outlined"
                label={t('shell.strategy', { name: status.activeStrategy })}
                sx={{ maxWidth: 280 }}
              />
            )}
            <Chip
              size="small"
              clickable
              onClick={() => onPage('service')}
              icon={<AdminPanelSettingsOutlined />}
              color={status?.isAdmin ? 'secondary' : 'warning'}
              variant="outlined"
              label={status?.isAdmin ? t('shell.adminGranted') : t('shell.adminMissing')}
            />
          </Stack>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            border: 0,
            borderRight: '1px solid rgba(80,90,110,.14)',
            display: 'flex',
            flexDirection: 'column',
          },
        }}
      >
        <Box sx={{ px: 2.5, py: 2.5 }}>
          <Typography variant="subtitle1" fontWeight={800} letterSpacing="-.04em" lineHeight={1.2}>
            Zapretyd
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {t('app.subtitle')}
          </Typography>
        </Box>

        <List sx={{ flex: 1, px: 0.5 }}>
          {navigation.map((item) => (
            <ListItemButton
              key={item.key}
              selected={page === item.key}
              onClick={() => onPage(item.key)}
              sx={{ mx: 1, borderRadius: 2 }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={t(item.labelKey)} />
            </ListItemButton>
          ))}
        </List>

        <Box sx={{ px: 2.5, py: 2 }}>
          <Typography variant="caption" color="text.secondary">
            {t('shell.appVersion', { version: appVersion })}
          </Typography>
        </Box>
      </Drawer>

      <Box
        component="main"
        sx={{
          flex: 1,
          p: { xs: 3, md: 5 },
          pt: { xs: 12, md: 13 },
          maxWidth: 1440,
          width: `calc(100% - ${DRAWER_WIDTH}px)`,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
