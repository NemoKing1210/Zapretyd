import {
  AdminPanelSettingsOutlined,
  OpenInNewOutlined,
  PauseOutlined,
  PlayArrowOutlined,
  RestartAltOutlined,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import { useColorScheme } from '@mui/material/styles';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect, useState } from 'react';
import {
  api,
  normalizeThemeMode,
  type InstalledVersion,
  type ServiceStatus,
  type StrategyInfo,
} from '../../../shared/api/zapretyd';
import { useTranslation } from '../../../shared/i18n';

const btnSx = {
  textTransform: 'none',
  whiteSpace: 'nowrap',
  fontWeight: 600,
  px: 1.5,
} as const;

function StatusDot({ active }: { active: boolean }) {
  return (
    <Box
      aria-hidden
      sx={{
        width: 9,
        height: 9,
        borderRadius: '50%',
        bgcolor: active ? 'success.main' : 'action.disabled',
        flexShrink: 0,
        ...(active
          ? {
              animation: 'zapretydPulse 1.6s ease-in-out infinite',
              '@keyframes zapretydPulse': {
                '0%, 100%': { opacity: 1, transform: 'scale(1)' },
                '50%': { opacity: 0.55, transform: 'scale(0.85)' },
              },
              '@media (prefers-reduced-motion: reduce)': {
                animation: 'none',
              },
            }
          : {}),
      }}
    />
  );
}

export function TrayMenuApp() {
  const { t, translateError, reloadLocale } = useTranslation();
  const { setMode } = useColorScheme();
  const [status, setStatus] = useState<ServiceStatus>();
  const [versions, setVersions] = useState<InstalledVersion[]>([]);
  const [latestTag, setLatestTag] = useState<string>();
  const [version, setVersion] = useState('');
  const [strategies, setStrategies] = useState<StrategyInfo[]>([]);
  const [strategy, setStrategy] = useState('');
  const [strategiesLoading, setStrategiesLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(true);

  const hideMenu = useCallback(async () => {
    try {
      await getCurrentWindow().hide();
    } catch {
      await api.hideTrayMenu().catch(() => undefined);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [nextStatus, nextVersions, settings] = await Promise.all([
        api.status(),
        api.versions(),
        api.settings(),
        reloadLocale(),
      ]);
      setStatus(nextStatus);
      setVersions(nextVersions);
      setLatestTag(settings.cachedLatestTag);
      setMode(normalizeThemeMode(settings.theme));

      const active = nextVersions.find((item) => item.isActive);
      setVersion((current) => current || active?.tag || nextVersions[0]?.tag || '');
    } catch (cause) {
      setError(String(cause));
    } finally {
      setLoading(false);
    }
  }, [reloadLocale, setMode]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let unlistenOpened: (() => void) | undefined;

    void listen('tray-menu-opened', () => {
      setError('');
      void refresh();
    }).then((fn) => {
      unlistenOpened = fn;
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        void hideMenu();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      unlistenOpened?.();
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [hideMenu, refresh]);

  useEffect(() => {
    if (!version) {
      setStrategies([]);
      setStrategy('');
      return;
    }
    let cancelled = false;
    setStrategiesLoading(true);
    api
      .strategies(version)
      .then((items) => {
        if (cancelled) return;
        setStrategies(items);
        setStrategy((current) => {
          if (current && items.some((item) => item.name === current)) return current;
          return items[0]?.name ?? '';
        });
      })
      .catch((cause) => {
        if (!cancelled) setError(String(cause));
      })
      .finally(() => {
        if (!cancelled) setStrategiesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  useEffect(() => {
    const active = status?.activeStrategy;
    if (!active || strategies.length === 0) return;
    const activeVersion = versions.find((item) => item.isActive);
    if (!activeVersion || version !== activeVersion.tag) return;
    if (strategies.some((item) => item.name === active)) {
      setStrategy(active);
    }
  }, [status?.activeStrategy, strategies, version, versions]);

  const runAction = useCallback(
    async (action: () => Promise<void>) => {
      setBusy(true);
      setError('');
      try {
        await action();
        await refresh();
      } catch (cause) {
        setError(String(cause));
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const running = Boolean(status?.serviceRunning);
  const isAdmin = Boolean(status?.isAdmin);
  const picked = strategies.find((item) => item.name === strategy);
  const canControl = isAdmin && !busy && !loading;
  const activeVersionTag = versions.find((item) => item.isActive)?.tag;

  return (
    <Box
      sx={{
        boxSizing: 'border-box',
        width: '100%',
        height: '100%',
        p: 1.25,
        background: 'transparent',
      }}
    >
      <Box
        sx={{
          boxSizing: 'border-box',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'background.paper',
          borderRadius: '16px',
          overflow: 'hidden',
          userSelect: 'none',
          boxShadow: (theme) =>
            theme.palette.mode === 'dark'
              ? '0 8px 28px rgba(0,0,0,0.55)'
              : '0 8px 28px rgba(0,0,0,0.22)',
        }}
      >
        <Stack spacing={0.75} sx={{ px: 2, pt: 1.75, pb: 1.25 }}>
          <Stack direction="row" spacing={1.25} alignItems="center">
            <StatusDot active={running} />
            <Typography variant="subtitle1" fontWeight={700} lineHeight={1.2}>
              Zapretyd
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {loading ? t('tray.loading') : running ? t('overview.running') : t('overview.stopped')}
          </Typography>
          {!loading && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                wordBreak: 'break-word',
              }}
            >
              {status?.activeStrategy
                ? t('tray.strategyLine', {
                    strategy: status.activeStrategy,
                    version: activeVersionTag || '—',
                  })
                : t('overview.pickStrategyHint')}
            </Typography>
          )}
        </Stack>

        <Divider />

        <Stack spacing={1.5} sx={{ px: 2, py: 1.5, flex: 1, minHeight: 0, overflow: 'auto' }}>
          {error && (
            <Alert
              severity="error"
              onClose={() => setError('')}
              sx={{ alignItems: 'flex-start', '& .MuiAlert-message': { overflowWrap: 'anywhere' } }}
            >
              {translateError(error) || t('toast.error.body')}
            </Alert>
          )}

          {!isAdmin && !loading && (
            <Alert
              severity="warning"
              icon={<AdminPanelSettingsOutlined fontSize="inherit" />}
              sx={{
                alignItems: 'flex-start',
                '& .MuiAlert-message': { width: '100%', minWidth: 0 },
              }}
            >
              <Typography variant="body2" sx={{ mb: 1.25, overflowWrap: 'break-word' }}>
                {t('tray.adminWarning')}
              </Typography>
              <Button
                fullWidth
                size="small"
                variant="outlined"
                color="warning"
                disabled={busy}
                startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}
                onClick={() => void runAction(() => api.relaunchAsAdmin())}
                sx={btnSx}
              >
                {t('tray.relaunchAdmin')}
              </Button>
            </Alert>
          )}

          <Stack spacing={1}>
            {running ? (
              <Button
                fullWidth
                size="medium"
                variant="outlined"
                color="inherit"
                startIcon={
                  busy ? <CircularProgress size={18} color="inherit" /> : <PauseOutlined />
                }
                disabled={!canControl}
                onClick={() => void runAction(() => api.stop())}
                sx={btnSx}
              >
                {t('overview.stop')}
              </Button>
            ) : (
              <Button
                fullWidth
                size="medium"
                variant="outlined"
                color="success"
                startIcon={
                  busy ? <CircularProgress size={18} color="inherit" /> : <PlayArrowOutlined />
                }
                disabled={!canControl || !status?.serviceExists}
                onClick={() => void runAction(() => api.start())}
                sx={btnSx}
              >
                {t('overview.start')}
              </Button>
            )}
            <Button
              fullWidth
              size="medium"
              variant="outlined"
              startIcon={
                busy ? <CircularProgress size={18} color="inherit" /> : <RestartAltOutlined />
              }
              disabled={!canControl || !status?.serviceExists}
              onClick={() =>
                void runAction(async () => {
                  if (status?.serviceRunning) await api.stop();
                  await api.start();
                })
              }
              sx={btnSx}
            >
              {t('tray.restart')}
            </Button>
          </Stack>

          <Box>
            <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: '0.06em' }}>
              {t('tray.assign')}
            </Typography>
            <Stack spacing={1.25} mt={1}>
              <FormControl fullWidth size="small" disabled={!isAdmin || busy || loading}>
                <InputLabel>{t('overview.version')}</InputLabel>
                <Select
                  label={t('overview.version')}
                  value={version}
                  MenuProps={{ disablePortal: true, PaperProps: { sx: { maxHeight: 220 } } }}
                  onChange={(event) => {
                    setVersion(String(event.target.value));
                    setStrategy('');
                  }}
                >
                  {versions.length === 0 && (
                    <MenuItem value="" disabled>
                      {t('tray.noVersions')}
                    </MenuItem>
                  )}
                  {versions.map((item) => (
                    <MenuItem key={item.tag} value={item.tag}>
                      {item.tag}
                      {latestTag && item.tag === latestTag
                        ? ` · ${t('overview.latestVersion')}`
                        : ''}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl
                fullWidth
                size="small"
                disabled={!version || !isAdmin || busy || strategiesLoading}
              >
                <InputLabel>{t('overview.strategyLabel')}</InputLabel>
                <Select
                  label={t('overview.strategyLabel')}
                  value={strategy}
                  MenuProps={{ disablePortal: true, PaperProps: { sx: { maxHeight: 220 } } }}
                  onChange={(event) => setStrategy(String(event.target.value))}
                >
                  {strategies.map((item) => (
                    <MenuItem key={item.name} value={item.name} sx={{ whiteSpace: 'normal' }}>
                      {item.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button
                fullWidth
                size="medium"
                variant="contained"
                startIcon={
                  busy ? <CircularProgress size={18} color="inherit" /> : <PlayArrowOutlined />
                }
                disabled={!picked || !canControl || strategiesLoading}
                onClick={() => setConfirm(true)}
                sx={btnSx}
              >
                {t('tray.apply')}
              </Button>
            </Stack>
          </Box>
        </Stack>

        <Divider />

        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          spacing={1}
          sx={{ px: 1.25, py: 1 }}
        >
          <Button
            size="small"
            variant="text"
            startIcon={<OpenInNewOutlined fontSize="small" />}
            onClick={() => {
              void api.showMainWindow().then(() => hideMenu());
            }}
            sx={{ ...btnSx, flex: '0 0 auto' }}
          >
            {t('tray.openApp')}
          </Button>
          <Button
            size="small"
            variant="text"
            color="inherit"
            onClick={() => void api.quitApp()}
            sx={{ ...btnSx, flex: '0 0 auto' }}
          >
            {t('tray.quit')}
          </Button>
        </Stack>

        <Dialog
          open={confirm}
          onClose={() => !busy && setConfirm(false)}
          disablePortal
          fullWidth
          maxWidth={false}
          PaperProps={{ sx: { m: 1.5, width: 'auto' } }}
        >
          <DialogTitle>{t('overview.confirmTitle')}</DialogTitle>
          <DialogContent>{t('overview.confirmBody')}</DialogContent>
          <DialogActions>
            <Button variant="text" disabled={busy} onClick={() => setConfirm(false)} sx={btnSx}>
              {t('overview.cancel')}
            </Button>
            <Button
              disabled={busy || !picked}
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
              onClick={() => {
                if (!picked) return;
                void runAction(async () => {
                  await api.activate(picked);
                  setConfirm(false);
                });
              }}
              sx={btnSx}
            >
              {t('overview.replace')}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Box>
  );
}
