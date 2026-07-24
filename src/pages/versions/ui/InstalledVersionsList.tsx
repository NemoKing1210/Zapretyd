import { useState } from 'react';
import { DeleteOutline } from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  Stack,
  Typography,
} from '@mui/material';
import type { InstalledVersion } from '../../../shared/api/zapretyd';
import { useTranslation } from '../../../shared/i18n';
import { formatBytes, formatDate, formatVersionPath } from '../../../shared/lib/format';

export function InstalledVersionsList({
  versions,
  latestTag,
  libraryPath,
  shortenPaths = false,
  onRemove,
  onOpen,
  onBrowseAll,
}: {
  versions: InstalledVersion[];
  latestTag?: string;
  libraryPath?: string;
  shortenPaths?: boolean;
  onRemove: (tag: string) => void | Promise<void>;
  onOpen: (path: string) => void;
  onBrowseAll: () => void;
}) {
  const { t } = useTranslation();
  const [removeTag, setRemoveTag] = useState<string | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const openRemove = (tag: string) => {
    setRemoveTag(tag);
    setRemoveOpen(true);
  };
  const closeRemove = () => {
    if (confirmBusy) return;
    setRemoveOpen(false);
  };

  if (versions.length === 0) {
    return (
      <Alert
        severity="info"
        action={
          <Button color="inherit" size="small" onClick={onBrowseAll}>
            {t('versions.tabAll')}
          </Button>
        }
      >
        {t('versions.noVersions')}
      </Alert>
    );
  }

  return (
    <Stack spacing={2}>
      {versions.map((version) => (
        <Card key={version.tag}>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="start">
              <Box>
                <Typography variant="h6" component="div">
                  {version.tag}
                  {latestTag && version.tag === latestTag && (
                    <Chip
                      label={t('versions.latest')}
                      color="primary"
                      size="small"
                      sx={{ ml: 1, verticalAlign: 'middle' }}
                    />
                  )}
                  {version.isActive && (
                    <Chip
                      label={t('versions.active')}
                      color="secondary"
                      size="small"
                      sx={{ ml: 1, verticalAlign: 'middle' }}
                    />
                  )}
                </Typography>
                <Typography color="text.secondary" variant="body2">
                  {t('versions.installed', {
                    date: formatDate(version.installedAt),
                    size: formatBytes(version.size),
                  })}
                </Typography>
                <Link
                  component="button"
                  type="button"
                  variant="caption"
                  onClick={() => onOpen(version.path)}
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
                  {formatVersionPath(version.path, libraryPath, shortenPaths)}
                </Link>
              </Box>
            </Stack>
          </CardContent>
          <CardActions>
            <Button
              variant="text"
              color="error"
              disabled={version.isActive || confirmBusy}
              startIcon={<DeleteOutline />}
              onClick={() => openRemove(version.tag)}
            >
              {t('versions.remove')}
            </Button>
          </CardActions>
        </Card>
      ))}
      <Dialog
        open={removeOpen}
        onClose={closeRemove}
        slotProps={{
          transition: {
            onExited: () => setRemoveTag(null),
          },
        }}
      >
        <DialogTitle>{t('versions.removeConfirmTitle', { tag: removeTag ?? '' })}</DialogTitle>
        <DialogContent>{t('versions.removeConfirmBody')}</DialogContent>
        <DialogActions>
          <Button variant="text" disabled={confirmBusy} onClick={closeRemove}>
            {t('versions.cancel')}
          </Button>
          <Button
            color="error"
            disabled={confirmBusy || !removeTag}
            startIcon={confirmBusy ? <CircularProgress size={18} color="inherit" /> : undefined}
            onClick={async () => {
              if (!removeTag) return;
              setConfirmBusy(true);
              try {
                await onRemove(removeTag);
                setRemoveOpen(false);
              } finally {
                setConfirmBusy(false);
              }
            }}
          >
            {t('versions.remove')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
