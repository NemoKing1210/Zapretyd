import {
  DeleteOutline,
  DescriptionOutlined,
  PauseOutlined,
  PlayArrowOutlined,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import { alpha, type Theme } from '@mui/material/styles';
import { useEffect, useState } from 'react';
import type { InstalledVersion, ServiceStatus, StrategyInfo } from '../../../shared/api/zapretyd';
import { useTranslation } from '../../../shared/i18n';
import type { TranslationKey } from '../../../shared/i18n/locales/en';

function splitFileName(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return { base: name, ext: '' };
  return { base: name.slice(0, dot), ext: name.slice(dot) };
}

const runningActionSx = {
  borderColor: (theme: Theme) => alpha(theme.palette.primary.contrastText, 0.45),
  color: 'primary.contrastText',
  '&:hover': {
    borderColor: (theme: Theme) => alpha(theme.palette.primary.contrastText, 0.75),
    bgcolor: (theme: Theme) => alpha(theme.palette.primary.contrastText, 0.1),
  },
  '&.Mui-disabled': {
    borderColor: (theme: Theme) => alpha(theme.palette.primary.contrastText, 0.2),
    color: (theme: Theme) => alpha(theme.palette.primary.contrastText, 0.4),
  },
} as const;

function StatusDot({ active, pulse }: { active: boolean; pulse?: boolean }) {
  return (
    <Box
      aria-hidden
      sx={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        bgcolor: active ? 'success.main' : 'action.disabled',
        flexShrink: 0,
        ...(active && pulse
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

function StatusItem({
  label,
  value,
  active,
  pulse,
}: {
  label: string;
  value: string;
  active: boolean;
  pulse?: boolean;
}) {
  return (
    <Card sx={{ minWidth: 0, height: '100%' }}>
      <CardContent sx={{ py: 2, height: '100%', '&:last-child': { pb: 2 } }}>
        <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
          <StatusDot active={active} pulse={pulse} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" display="block">
              {label}
            </Typography>
            <Typography variant="body2" fontWeight={600}>
              {value}
            </Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

export function OverviewPage({
  status,
  versions,
  latestTag,
  serviceBusy,
  loadStrategies,
  onActivate,
  onStart,
  onStop,
  onRemove,
  onAdmin,
  onStrategiesError,
}: {
  status?: ServiceStatus;
  versions: InstalledVersion[];
  latestTag?: string;
  serviceBusy: boolean;
  loadStrategies: (tag: string) => Promise<StrategyInfo[]>;
  onActivate: (strategy: StrategyInfo) => Promise<void>;
  onStart: () => void;
  onStop: () => void;
  onRemove: () => void;
  onAdmin: () => void;
  onStrategiesError: (cause: unknown) => void;
}) {
  const { t } = useTranslation();
  const [version, setVersion] = useState('');
  const [strategies, setStrategies] = useState<StrategyInfo[]>([]);
  const [strategy, setStrategy] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [strategiesLoading, setStrategiesLoading] = useState(false);

  // Prefill empty selectors from the active service (mount / remount after navigation).
  useEffect(() => {
    const activeVersion = versions.find((item) => item.isActive);
    if (!activeVersion) return;
    setVersion((prev) => prev || activeVersion.tag);
  }, [versions]);

  useEffect(() => {
    if (!version) {
      setStrategies([]);
      setStrategiesLoading(false);
      return;
    }
    let cancelled = false;
    setStrategiesLoading(true);
    loadStrategies(version)
      .then((list) => {
        if (!cancelled) setStrategies(list);
      })
      .catch((cause) => {
        if (!cancelled) setStrategies([]);
        onStrategiesError(cause);
      })
      .finally(() => {
        if (!cancelled) setStrategiesLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Intentionally omit onStrategiesError — parent callback identity must not retrigger loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version + loadStrategies only
  }, [version, loadStrategies]);

  useEffect(() => {
    const activeName = status?.activeStrategy;
    if (!activeName) return;
    const activeVersion = versions.find((item) => item.isActive);
    if (!activeVersion || version !== activeVersion.tag) return;
    if (!strategies.some((item) => item.name === activeName)) return;
    setStrategy((prev) => prev || activeName);
  }, [status?.activeStrategy, strategies, version, versions]);

  const picked = strategies.find((item) => item.name === strategy);
  // Service state is authoritative; winws may lag briefly after `sc start`.
  const running = Boolean(status?.serviceRunning);
  const statusReady = status !== undefined;
  const message = status?.messageCode ? t(status.messageCode as TranslationKey) : '';
  const activeStrategyName = status?.activeStrategy;
  const activeStrategyParts = activeStrategyName ? splitFileName(activeStrategyName) : null;

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h3">{t('overview.title')}</Typography>
        <Typography color="text.secondary" mt={1}>
          {statusReady ? message || t('overview.subtitle') : t('overview.subtitle')}
        </Typography>
      </Box>

      <Card
        sx={{
          bgcolor: running ? 'primary.main' : 'background.paper',
          color: running ? 'primary.contrastText' : 'text.primary',
          transition: (theme) =>
            theme.transitions.create(['background-color', 'color'], { duration: 280 }),
        }}
      >
        <CardContent sx={{ p: 4 }}>
          {!statusReady ? (
            <Stack spacing={2}>
              <Skeleton variant="rounded" width={88} height={28} />
              <Skeleton variant="text" width="55%" height={40} />
              <Skeleton variant="rounded" width={220} height={32} />
              <Stack direction="row" spacing={1.5} mt={1}>
                <Skeleton variant="rounded" width={120} height={36} />
                <Skeleton variant="rounded" width={140} height={36} />
              </Stack>
            </Stack>
          ) : (
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              alignItems={{ xs: 'stretch', sm: 'center' }}
              justifyContent="space-between"
              spacing={3}
            >
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Chip
                  size="small"
                  label={running ? t('overview.active') : t('overview.inactive')}
                  color={running ? 'success' : 'default'}
                  sx={{
                    mb: 2,
                    ...(running
                      ? {
                          bgcolor: (theme) => alpha(theme.palette.primary.contrastText, 0.16),
                          color: 'primary.contrastText',
                        }
                      : {}),
                  }}
                />
                <Typography variant="h4">
                  {running ? t('overview.running') : t('overview.stopped')}
                </Typography>
                {activeStrategyName && activeStrategyParts ? (
                  <Stack
                    direction="row"
                    spacing={1.25}
                    alignItems="center"
                    flexWrap="wrap"
                    useFlexGap
                    sx={{ mt: 1.75 }}
                    aria-label={t('overview.strategy', { name: activeStrategyName })}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        opacity: 0.72,
                        fontWeight: 600,
                        letterSpacing: 0.06,
                        textTransform: 'uppercase',
                      }}
                    >
                      {t('overview.strategyLabel')}
                    </Typography>
                    <Box
                      component="span"
                      title={activeStrategyName}
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.75,
                        maxWidth: '100%',
                        px: 1.25,
                        py: 0.625,
                        borderRadius: 1.5,
                        border: 1,
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                        fontSize: '0.875rem',
                        lineHeight: 1.25,
                        ...(running
                          ? {
                              bgcolor: (theme) => alpha(theme.palette.primary.contrastText, 0.14),
                              borderColor: (theme) =>
                                alpha(theme.palette.primary.contrastText, 0.32),
                              color: 'primary.contrastText',
                            }
                          : {
                              bgcolor: 'action.hover',
                              borderColor: 'divider',
                              color: 'text.primary',
                            }),
                      }}
                    >
                      <DescriptionOutlined sx={{ fontSize: 16, opacity: 0.8, flexShrink: 0 }} />
                      <Box
                        component="span"
                        sx={{
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <Box component="span" sx={{ fontWeight: 700 }}>
                          {activeStrategyParts.base}
                        </Box>
                        {activeStrategyParts.ext ? (
                          <Box component="span" sx={{ fontWeight: 500, opacity: 0.7 }}>
                            {activeStrategyParts.ext}
                          </Box>
                        ) : null}
                      </Box>
                    </Box>
                  </Stack>
                ) : (
                  <Typography sx={{ opacity: 0.85, mt: 1 }}>
                    {t('overview.pickStrategyHint')}
                  </Typography>
                )}
                <Stack direction="row" spacing={1.5} mt={3} flexWrap="wrap" useFlexGap>
                  {status.serviceRunning ? (
                    <Button
                      variant="outlined"
                      color="inherit"
                      startIcon={
                        serviceBusy ? (
                          <CircularProgress size={18} color="inherit" />
                        ) : (
                          <PauseOutlined />
                        )
                      }
                      disabled={!status.isAdmin || serviceBusy}
                      onClick={onStop}
                      sx={runningActionSx}
                    >
                      {t('overview.stop')}
                    </Button>
                  ) : (
                    <Button
                      variant="outlined"
                      color="success"
                      startIcon={
                        serviceBusy ? (
                          <CircularProgress size={18} color="inherit" />
                        ) : (
                          <PlayArrowOutlined />
                        )
                      }
                      disabled={!status.serviceExists || !status.isAdmin || serviceBusy}
                      onClick={onStart}
                    >
                      {t('overview.start')}
                    </Button>
                  )}
                  <Button
                    variant="outlined"
                    color={running ? 'inherit' : 'error'}
                    startIcon={
                      serviceBusy ? (
                        <CircularProgress size={18} color="inherit" />
                      ) : (
                        <DeleteOutline />
                      )
                    }
                    disabled={!status.serviceExists || !status.isAdmin || serviceBusy}
                    onClick={onRemove}
                    sx={running ? runningActionSx : undefined}
                  >
                    {t('overview.removeService')}
                  </Button>
                </Stack>
              </Box>
            </Stack>
          )}
        </CardContent>
      </Card>

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: {
            xs: 'repeat(2, minmax(0, 1fr))',
            lg: 'repeat(4, minmax(0, 1fr))',
          },
        }}
      >
        {!statusReady ? (
          [0, 1, 2, 3].map((key) => (
            <Card key={key} sx={{ minWidth: 0, height: '100%' }}>
              <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                <Skeleton variant="rounded" height={40} />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <StatusItem
              label={t('overview.serviceCard')}
              value={
                status.serviceRunning ? t('overview.runningState') : t('overview.stoppedState')
              }
              active={status.serviceRunning}
              pulse={status.serviceRunning}
            />
            <StatusItem
              label={t('overview.winws')}
              value={status.winwsRunning ? t('overview.runningState') : t('overview.stoppedState')}
              active={status.winwsRunning}
              pulse={status.winwsRunning}
            />
            <StatusItem
              label={t('overview.windivert')}
              value={
                status.windivertRunning
                  ? t('overview.windivertActive')
                  : t('overview.windivertInactive')
              }
              active={status.windivertRunning}
              pulse={status.windivertRunning}
            />
            <StatusItem
              label={t('overview.adminRights')}
              value={status.isAdmin ? t('overview.adminGranted') : t('overview.adminMissing')}
              active={Boolean(status.isAdmin)}
            />
          </>
        )}
      </Box>

      {statusReady && !status.isAdmin && (
        <Alert
          severity="warning"
          action={
            <Button
              color="inherit"
              size="small"
              disabled={serviceBusy}
              startIcon={serviceBusy ? <CircularProgress size={14} color="inherit" /> : undefined}
              onClick={onAdmin}
            >
              {t('overview.restart')}
            </Button>
          }
        >
          {t('overview.adminWarning')}
        </Alert>
      )}

      {statusReady && status.isAdmin && (
        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Box>
                <Typography variant="overline" color="text.secondary">
                  {t('overview.assignStrategy')}
                </Typography>
                <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5 }}>
                  {t('overview.assignStrategyHint')}
                </Typography>
              </Box>
              <FormControl fullWidth disabled={serviceBusy}>
                <InputLabel>{t('overview.version')}</InputLabel>
                <Select
                  label={t('overview.version')}
                  value={version}
                  renderValue={(selected) => {
                    if (!selected) return '';
                    return (
                      <Box
                        component="span"
                        sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}
                      >
                        {selected}
                        {selected === latestTag && (
                          <Chip
                            size="small"
                            color="primary"
                            label={t('overview.latestVersion')}
                            sx={{ pointerEvents: 'none' }}
                          />
                        )}
                      </Box>
                    );
                  }}
                  onChange={(event) => {
                    setVersion(String(event.target.value));
                    setStrategy('');
                  }}
                >
                  <MenuItem value="">
                    <em>{t('overview.selectVersion')}</em>
                  </MenuItem>
                  {versions.map((item) => (
                    <MenuItem key={item.tag} value={item.tag}>
                      {item.tag}
                      {latestTag && item.tag === latestTag && (
                        <Chip
                          size="small"
                          color="primary"
                          label={t('overview.latestVersion')}
                          sx={{ ml: 1, pointerEvents: 'none' }}
                        />
                      )}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Box>
                <FormControl fullWidth disabled={!version || serviceBusy}>
                  <InputLabel>{t('overview.strategyLabel')}</InputLabel>
                  <Select
                    label={t('overview.strategyLabel')}
                    value={strategy}
                    onChange={(event) => setStrategy(String(event.target.value))}
                  >
                    {strategies.map((item) => (
                      <MenuItem key={item.name} value={item.name}>
                        {item.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                {strategiesLoading && (
                  <Stack direction="row" spacing={1} alignItems="center" mt={1}>
                    <CircularProgress size={14} />
                    <Typography variant="caption" color="text.secondary">
                      {t('overview.loadingStrategies')}
                    </Typography>
                  </Stack>
                )}
              </Box>
              <Button
                startIcon={
                  serviceBusy ? (
                    <CircularProgress size={18} color="inherit" />
                  ) : (
                    <PlayArrowOutlined />
                  )
                }
                disabled={!picked || serviceBusy || strategiesLoading}
                onClick={() => setConfirm(true)}
                sx={{ alignSelf: 'flex-start' }}
              >
                {t('overview.replaceAndStart')}
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      <Dialog open={confirm} onClose={() => !serviceBusy && setConfirm(false)}>
        <DialogTitle>{t('overview.confirmTitle')}</DialogTitle>
        <DialogContent>{t('overview.confirmBody')}</DialogContent>
        <DialogActions>
          <Button variant="text" disabled={serviceBusy} onClick={() => setConfirm(false)}>
            {t('overview.cancel')}
          </Button>
          <Button
            disabled={serviceBusy || !picked}
            startIcon={serviceBusy ? <CircularProgress size={18} color="inherit" /> : undefined}
            onClick={async () => {
              if (!picked) return;
              await onActivate(picked);
              setConfirm(false);
            }}
          >
            {t('overview.replace')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
