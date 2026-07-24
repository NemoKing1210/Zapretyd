import { useState } from 'react';
import {
  AdminPanelSettingsOutlined,
  ArticleOutlined,
  ChevronLeft,
  ChevronRight,
  DashboardOutlined,
  FolderOpenOutlined,
  NewReleasesOutlined,
  PlayArrowOutlined,
  SettingsOutlined,
  StopOutlined,
  VerifiedOutlined,
} from '@mui/icons-material';
import {
  AppBar,
  Badge,
  Box,
  Chip,
  CircularProgress,
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
import { useErrorLog } from '../../../shared/lib/errorLog';

const DRAWER_WIDTH = 240;
const DRAWER_WIDTH_COLLAPSED = 72;
const SIDEBAR_COLLAPSED_KEY = 'zapretyd.sidebarCollapsed';

const baseNavigation = [
  { key: 'overview', labelKey: 'nav.overview' as const, icon: <DashboardOutlined /> },
  { key: 'versions', labelKey: 'nav.versions' as const, icon: <FolderOpenOutlined /> },
  { key: 'settings', labelKey: 'nav.settings' as const, icon: <SettingsOutlined /> },
] as const;

const logsNavItem = {
  key: 'logs',
  labelKey: 'nav.logs' as const,
  icon: <ArticleOutlined />,
} as const;

const navigation = import.meta.env.DEV
  ? [...baseNavigation, logsNavItem]
  : [...baseNavigation];

export type PageKey = (typeof baseNavigation)[number]['key'] | 'logs';

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
  installedCount = 0,
  syncing,
  latestTag,
  latestInstalled = false,
  onOpenLatestVersion,
  children,
}: {
  page: PageKey;
  onPage: (page: PageKey) => void;
  status?: ServiceStatus;
  installedCount?: number;
  syncing?: 'catalog' | 'download';
  latestTag?: string;
  latestInstalled?: boolean;
  onOpenLatestVersion?: () => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const errorLog = useErrorLog();
  const running = Boolean(status?.serviceRunning && status.winwsRunning);
  const appVersion = import.meta.env.VITE_APP_VERSION as string;
  const drawerWidth = collapsed ? DRAWER_WIDTH_COLLAPSED : DRAWER_WIDTH;
  const errorCount = import.meta.env.DEV ? errorLog.length : 0;
  const showLatestBadge = Boolean(latestTag) && syncing !== 'catalog';

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
        <Toolbar
          sx={{
            gap: 1,
            justifyContent: 'space-between',
            minHeight: { xs: 64 },
          }}
        >
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            {syncing && (
              <Chip
                size="small"
                color="primary"
                variant="outlined"
                icon={<CircularProgress size={14} color="inherit" />}
                label={
                  syncing === 'download'
                    ? t('shell.downloadingVersion')
                    : t('shell.checkingReleases')
                }
                sx={{
                  '& .MuiChip-icon': { ml: 1 },
                }}
              />
            )}
            {showLatestBadge && (
              <Chip
                size="small"
                clickable
                color={latestInstalled ? 'default' : 'primary'}
                variant="outlined"
                icon={latestInstalled ? <VerifiedOutlined /> : <NewReleasesOutlined />}
                label={t('shell.latestVersion', { tag: latestTag! })}
                onClick={onOpenLatestVersion}
              />
            )}
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Chip
              size="small"
              clickable
              onClick={() => onPage('overview')}
              icon={running ? <PlayArrowOutlined /> : <StopOutlined />}
              color={running ? 'success' : 'default'}
              variant={running ? 'filled' : 'outlined'}
              label={running ? t('shell.serviceRunning') : t('shell.serviceStopped')}
            />
            {status?.activeStrategy && (
              <Chip
                size="small"
                clickable
                onClick={() => onPage('overview')}
                variant="outlined"
                label={t('shell.strategy', { name: status.activeStrategy })}
                sx={{ maxWidth: 280 }}
              />
            )}
            <Chip
              size="small"
              clickable
              onClick={() => onPage('overview')}
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
              const showVersionsBadge = item.key === 'versions' && installedCount > 0;
              const showLogsBadge = item.key === 'logs' && errorCount > 0;
              const badgeCount = showVersionsBadge
                ? installedCount
                : showLogsBadge
                  ? errorCount
                  : 0;
              const badgeColor = showLogsBadge ? 'error' : 'primary';
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
                    {collapsed && badgeCount > 0 ? (
                      <Badge badgeContent={badgeCount} color={badgeColor} max={99}>
                        {item.icon}
                      </Badge>
                    ) : (
                      item.icon
                    )}
                  </ListItemIcon>
                  {!collapsed && (
                    <ListItemText
                      primary={
                        badgeCount > 0 ? (
                          <Stack direction="row" alignItems="center" spacing={1} component="span">
                            <Box component="span" sx={{ minWidth: 0 }}>
                              {label}
                            </Box>
                            <Chip
                              size="small"
                              color={showLogsBadge ? 'error' : 'default'}
                              label={badgeCount}
                              sx={{ height: 22, pointerEvents: 'none' }}
                            />
                          </Stack>
                        ) : (
                          label
                        )
                      }
                      sx={{ minWidth: 0 }}
                    />
                  )}
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
