import { useState } from 'react';
import { DeleteOutline, DownloadOutlined, ExpandMore, RefreshOutlined } from '@mui/icons-material';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
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
  Link,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import type { InstalledVersion, ReleaseInfo } from '../../../shared/api/zapretyd';
import { useTranslation } from '../../../shared/i18n';
import { formatBytes, formatDate, formatVersionPath } from '../../../shared/lib/format';
import { ReleaseNotesBody } from './ReleaseNotesBody';

type ConfirmAction =
  | { type: 'reinstall'; release: ReleaseInfo }
  | { type: 'remove'; tag: string };

export function AllReleasesList({
  releases,
  versions,
  latestTag,
  libraryPath,
  shortenPaths = false,
  online,
  loading,
  loadingMore,
  hasMore,
  error,
  installingTag,
  onLoadMore,
  onInstall,
  onRemove,
  onOpen,
}: {
  releases: ReleaseInfo[];
  versions: InstalledVersion[];
  latestTag?: string;
  libraryPath?: string;
  shortenPaths?: boolean;
  online: boolean;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error?: string;
  installingTag?: string;
  onLoadMore: () => void;
  onInstall: (release: ReleaseInfo, force?: boolean) => void | Promise<void>;
  onRemove: (tag: string) => void | Promise<void>;
  onOpen: (path: string) => void;
}) {
  const { t } = useTranslation();
  const [expandedTag, setExpandedTag] = useState<string | false>(false);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const installedByTag = new Map(versions.map((version) => [version.tag, version]));
  const busy = Boolean(installingTag) || confirmBusy;

  const openConfirm = (action: ConfirmAction) => {
    setConfirm(action);
    setConfirmOpen(true);
  };
  const closeConfirm = () => {
    if (confirmBusy) return;
    setConfirmOpen(false);
  };

  if (loading) {
    return (
      <Stack spacing={2}>
        {Array.from({ length: 4 }, (_, index) => (
          <Card
            key={index}
            sx={{
              animation: 'zapretydSkeletonIn 360ms ease both',
              animationDelay: `${index * 70}ms`,
              '@keyframes zapretydSkeletonIn': {
                from: { opacity: 0, transform: 'translateY(6px)' },
                to: { opacity: 1, transform: 'translateY(0)' },
              },
              '@media (prefers-reduced-motion: reduce)': {
                animation: 'none',
              },
            }}
          >
            <CardContent sx={{ pb: 1 }}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                justifyContent="space-between"
                gap={2}
                alignItems={{ sm: 'flex-start' }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Skeleton variant="rounded" width={96} height={28} sx={{ mb: 1 }} />
                  <Skeleton variant="text" width="42%" height={22} />
                  <Skeleton variant="text" width="58%" height={20} />
                </Box>
                <Skeleton
                  variant="rounded"
                  width={120}
                  height={36}
                  sx={{ flexShrink: 0, borderRadius: 2 }}
                />
              </Stack>
            </CardContent>
            <Box sx={{ borderTop: 1, borderColor: 'divider', px: 2, py: 1.25 }}>
              <Skeleton variant="text" width={110} height={22} />
            </Box>
          </Card>
        ))}
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}
      {!error && releases.length === 0 && (
        <Alert severity="info">{t('versions.noReleases')}</Alert>
      )}
      {releases.map((release) => {
        const installed = installedByTag.get(release.tag);
        const installing = installingTag === release.tag;
        return (
          <Card key={release.tag}>
            <CardContent sx={{ pb: 1 }}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                justifyContent="space-between"
                gap={2}
                alignItems={{ sm: 'flex-start' }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography variant="h6">{release.tag}</Typography>
                    {latestTag && release.tag === latestTag && (
                      <Chip label={t('versions.latest')} color="primary" size="small" />
                    )}
                    {release.prerelease && (
                      <Chip label={t('versions.prerelease')} size="small" variant="outlined" />
                    )}
                  </Stack>
                  {release.name !== release.tag && (
                    <Typography color="text.secondary" variant="body2">
                      {release.name}
                    </Typography>
                  )}
                  <Typography color="text.secondary" variant="body2">
                    {t('versions.published', {
                      date: formatDate(release.publishedAt),
                      size: formatBytes(release.size),
                    })}
                  </Typography>
                  {installed && (
                    <Link
                      component="button"
                      type="button"
                      variant="caption"
                      onClick={() => onOpen(installed.path)}
                      sx={{
                        display: 'block',
                        mt: 0.75,
                        maxWidth: '100%',
                        textAlign: 'left',
                        wordBreak: 'break-all',
                        cursor: 'pointer',
                        color: 'primary.main',
                      }}
                    >
                      {formatVersionPath(installed.path, libraryPath, shortenPaths)}
                    </Link>
                  )}
                </Box>
                {installed ? (
                  <Stack direction="row" spacing={1} flexShrink={0} flexWrap="wrap" useFlexGap>
                    <Button
                      color="warning"
                      startIcon={
                        installing ? (
                          <CircularProgress size={18} color="inherit" />
                        ) : (
                          <RefreshOutlined />
                        )
                      }
                      disabled={busy || installed.isActive || !online}
                      onClick={() => openConfirm({ type: 'reinstall', release })}
                    >
                      {t('versions.reinstall')}
                    </Button>
                    <Button
                      color="error"
                      startIcon={<DeleteOutline />}
                      disabled={busy || installed.isActive}
                      onClick={() => openConfirm({ type: 'remove', tag: release.tag })}
                    >
                      {t('versions.remove')}
                    </Button>
                  </Stack>
                ) : (
                  <Button
                    startIcon={
                      installing ? (
                        <CircularProgress size={18} color="inherit" />
                      ) : (
                        <DownloadOutlined />
                      )
                    }
                    disabled={busy || !online}
                    onClick={() => onInstall(release)}
                    sx={{ flexShrink: 0 }}
                  >
                    {t('versions.download')}
                  </Button>
                )}
              </Stack>
            </CardContent>
            <Accordion
              disableGutters
              elevation={0}
              expanded={expandedTag === release.tag}
              onChange={(_, open) => setExpandedTag(open ? release.tag : false)}
              sx={{
                bgcolor: 'transparent',
                '&:before': { display: 'none' },
                borderTop: 1,
                borderColor: 'divider',
              }}
            >
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Typography variant="body2">{t('versions.notes')}</Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0 }}>
                <ReleaseNotesBody body={release.body} htmlUrl={release.htmlUrl} />
              </AccordionDetails>
            </Accordion>
          </Card>
        );
      })}
      {hasMore && (
        <Box display="flex" justifyContent="center" pt={1}>
          <Button
            variant="outlined"
            disabled={loadingMore || busy || !online}
            startIcon={loadingMore ? <CircularProgress size={18} /> : undefined}
            onClick={onLoadMore}
          >
            {t('versions.loadMore')}
          </Button>
        </Box>
      )}
      <Dialog
        open={confirmOpen}
        onClose={closeConfirm}
        slotProps={{
          transition: {
            onExited: () => setConfirm(null),
          },
        }}
      >
        <DialogTitle>
          {confirm?.type === 'reinstall'
            ? t('versions.reinstallConfirmTitle', { tag: confirm.release.tag })
            : t('versions.removeConfirmTitle', { tag: confirm?.tag ?? '' })}
        </DialogTitle>
        <DialogContent>
          {confirm?.type === 'reinstall'
            ? t('versions.reinstallConfirmBody')
            : t('versions.removeConfirmBody')}
        </DialogContent>
        <DialogActions>
          <Button variant="text" disabled={confirmBusy} onClick={closeConfirm}>
            {t('versions.cancel')}
          </Button>
          <Button
            color={confirm?.type === 'reinstall' ? 'warning' : 'error'}
            disabled={confirmBusy || !confirm}
            startIcon={confirmBusy ? <CircularProgress size={18} color="inherit" /> : undefined}
            onClick={async () => {
              if (!confirm) return;
              setConfirmBusy(true);
              try {
                if (confirm.type === 'reinstall') {
                  await onInstall(confirm.release, true);
                } else {
                  await onRemove(confirm.tag);
                }
                setConfirmOpen(false);
              } finally {
                setConfirmBusy(false);
              }
            }}
          >
            {confirm?.type === 'reinstall' ? t('versions.reinstall') : t('versions.remove')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
