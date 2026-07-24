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
  Stack,
  Typography,
} from '@mui/material';
import type { InstalledVersion, ReleaseInfo } from '../../../shared/api/zapretyd';
import { useTranslation } from '../../../shared/i18n';
import { formatBytes, formatDate } from '../../../shared/lib/format';
import { ReleaseNotesBody } from './ReleaseNotesBody';

type ConfirmAction =
  | { type: 'reinstall'; release: ReleaseInfo }
  | { type: 'remove'; tag: string };

export function AllReleasesList({
  releases,
  versions,
  loading,
  loadingMore,
  hasMore,
  error,
  installingTag,
  onLoadMore,
  onInstall,
  onRemove,
}: {
  releases: ReleaseInfo[];
  versions: InstalledVersion[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error?: string;
  installingTag?: string;
  onLoadMore: () => void;
  onInstall: (release: ReleaseInfo, force?: boolean) => void | Promise<void>;
  onRemove: (tag: string) => void | Promise<void>;
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
      <Box display="flex" justifyContent="center" py={6}>
        <CircularProgress />
      </Box>
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
                      disabled={busy || installed.isActive}
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
                    disabled={busy}
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
            disabled={loadingMore || busy}
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
