import { useState } from 'react';
import {
  AdminPanelSettingsOutlined,
  ChevronLeft,
  ChevronRight,
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
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import type { ServiceStatus } from '../../../shared/api/zapretyd';
import { useTranslation } from '../../../shared/i18n';

const DRAWER_WIDTH = 240;
const DRAWER_WIDTH_COLLAPSED = 72;
const SIDEBAR_COLLAPSED_KEY = 'zapretyd.sidebarCollapsed';

const navigation = [
  { key: 'overview', labelKey: 'nav.overview' as const, icon: <DashboardOutlined /> },
  { key: 'versions', labelKey: 'nav.versions' as const, icon: <FolderOpenOutlined /> },
  { key: 'service', labelKey: 'nav.service' as const, icon: <StorageOutlined /> },
  { key: 'settings', labelKey: 'nav.settings' as const, icon: <SettingsOutlined /> },
];

export type PageKey = (typeof navigation)[number]['key'];

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

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
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const running = Boolean(status?.serviceRunning && status.winwsRunning);
  const appVersion = import.meta.env.VITE_APP_VERSION as string;
  const drawerWidth = collapsed ? DRAWER_WIDTH_COLLAPSED : DRAWER_WIDTH;

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        /* ignore quota / private mode */
      }
      return next;
    });
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar
        position="fixed"
        color="transparent"
        elevation={0}
        sx={{
          width: `calc(100% - ${drawerWidth}px)`,
          ml: `${drawerWidth}px`,
          borderBottom: '1px solid rgba(80,90,110,.14)',
          backdropFilter: 'blur(12px)',
          bgcolor: 'background.default',
          backgroundImage: 'none',
          transition: (theme) =>
            theme.transitions.create(['width', 'margin'], {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.enteringScreen,
            }),
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
          width: drawerWidth,
          flexShrink: 0,
          whiteSpace: 'nowrap',
          transition: (theme) =>
            theme.transitions.create('width', {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.enteringScreen,
            }),
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
            border: 0,
            borderRight: '1px solid rgba(80,90,110,.14)',
            display: 'flex',
            flexDirection: 'column',
            overflowX: 'hidden',
            transition: (theme) =>
              theme.transitions.create('width', {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.enteringScreen,
              }),
          },
        }}
      >
        <Box
          sx={{
            px: collapsed ? 1 : 2.5,
            py: 2.5,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: collapsed ? 'center' : 'space-between',
            gap: 1,
            minHeight: 72,
          }}
        >
          {!collapsed && (
            <Box sx={{ minWidth: 0 }}>
              <Typography
                variant="subtitle1"
                fontWeight={800}
                letterSpacing="-.04em"
                lineHeight={1.2}
              >
                Zapretyd
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                {t('app.subtitle')}
              </Typography>
            </Box>
          )}
          <Tooltip
            title={collapsed ? t('shell.expandSidebar') : t('shell.collapseSidebar')}
            placement="right"
          >
            <IconButton
              size="small"
              onClick={toggleCollapsed}
              aria-label={collapsed ? t('shell.expandSidebar') : t('shell.collapseSidebar')}
              sx={{ flexShrink: 0, mt: collapsed ? 0 : 0.25 }}
            >
              {collapsed ? <ChevronRight /> : <ChevronLeft />}
            </IconButton>
          </Tooltip>
        </Box>

        <Box sx={{ flex: 1, minWidth: 0, overflowX: 'hidden', overflowY: 'auto' }}>
          <List disablePadding sx={{ px: 0.5 }}>
            {navigation.map((item) => {
              const label = t(item.labelKey);
              const button = (
                <ListItemButton
                  key={item.key}
                  selected={page === item.key}
                  onClick={() => onPage(item.key)}
                  sx={{
                    mx: 1,
                    mb: 0.75,
                    borderRadius: 2,
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    px: collapsed ? 1 : 2,
                    overflow: 'hidden',
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: collapsed ? 0 : 40,
                      justifyContent: 'center',
                      color: 'inherit',
                    }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  {!collapsed && <ListItemText primary={label} sx={{ minWidth: 0 }} />}
                </ListItemButton>
              );

              return collapsed ? (
                <Tooltip key={item.key} title={label} placement="right">
                  {button}
                </Tooltip>
              ) : (
                button
              );
            })}
          </List>
        </Box>

        <Box
          sx={{
            px: collapsed ? 0.5 : 2.5,
            py: 2,
            textAlign: collapsed ? 'center' : 'left',
          }}
        >
          <Typography variant="caption" color="text.secondary" noWrap>
            {t('shell.appVersion', { version: appVersion })}
          </Typography>
        </Box>
      </Drawer>

      <Box
        component="main"
        sx={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          justifyContent: 'center',
          p: { xs: 3, md: 5 },
          pt: { xs: 12, md: 13 },
          transition: (theme) =>
            theme.transitions.create('width', {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.enteringScreen,
            }),
        }}
      >
        <Box sx={{ width: '100%', maxWidth: 1120 }}>{children}</Box>
      </Box>
    </Box>
  );
}
