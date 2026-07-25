import { useState } from 'react';
import {
  DeleteOutline,
  DescriptionOutlined,
  EditOutlined,
  RestoreOutlined,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { api, type ListFileInfo } from '../../../shared/api/zapretyd';
import { useTranslation } from '../../../shared/i18n';
import { formatBytes } from '../../../shared/lib/format';
import { ListFileEditorDialog } from './ListFileEditorDialog';

function splitFileName(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return { base: name, ext: '' };
  return { base: name.slice(0, dot), ext: name.slice(dot) };
}

export function VersionListsPanel({
  tag,
  files,
  error,
  onFilesChange,
}: {
  tag: string;
  files: ListFileInfo[];
  error: string | null;
  onFilesChange: (files: ListFileInfo[]) => void;
}) {
  const { t, translateError } = useTranslation();
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refreshFiles = async () => {
    const next = await api.listVersionListFiles(tag);
    onFilesChange(next);
  };

  const runAction = async (key: string, action: () => Promise<void>) => {
    setActionBusy(key);
    setActionError(null);
    try {
      await action();
      await refreshFiles();
    } catch (cause) {
      setActionError(translateError(String(cause)));
    } finally {
      setActionBusy(null);
    }
  };

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 0 }}>
        {error}
      </Alert>
    );
  }

  if (files.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        {t('versions.listsEmpty')}
      </Typography>
    );
  }

  return (
    <>
      <Stack spacing={1}>
        {actionError && (
          <Alert severity="error" onClose={() => setActionError(null)}>
            {actionError}
          </Alert>
        )}
        {files.map((file) => {
          const { base, ext } = splitFileName(file.name);
          const busy = actionBusy === file.name;
          const canEdit = !file.deleted;
          return (
            <Box
              key={file.name}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                width: '100%',
                boxSizing: 'border-box',
                px: 1.5,
                py: 1.25,
                borderRadius: 2,
                border: 1,
                borderColor: file.deleted ? 'warning.main' : 'divider',
                bgcolor: file.deleted ? 'action.hover' : 'background.paper',
                opacity: file.deleted ? 0.92 : 1,
              }}
            >
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: 1.5,
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                  bgcolor: 'action.selected',
                  color: file.deleted ? 'warning.main' : 'primary.main',
                }}
              >
                <DescriptionOutlined fontSize="small" />
              </Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Typography
                    variant="body2"
                    noWrap
                    title={file.name}
                    sx={{
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                      textDecoration: file.deleted ? 'line-through' : 'none',
                      color: file.deleted ? 'text.secondary' : 'text.primary',
                    }}
                  >
                    <Box component="span" sx={{ fontWeight: 600 }}>
                      {base}
                    </Box>
                    {ext && (
                      <Box component="span" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                        {ext}
                      </Box>
                    )}
                  </Typography>
                  {file.deleted && (
                    <Chip size="small" color="warning" label={t('versions.listsDeleted')} />
                  )}
                </Stack>
              </Box>
              {!file.deleted && (
                <Chip size="small" label={formatBytes(file.size)} sx={{ flexShrink: 0 }} />
              )}
              <Stack direction="row" spacing={0.25} flexShrink={0}>
                {canEdit && (
                  <Tooltip title={t('versions.listsEdit')}>
                    <span>
                      <IconButton
                        size="small"
                        disabled={busy}
                        onClick={() => {
                          setEditingName(file.name);
                          setEditorOpen(true);
                        }}
                      >
                        <EditOutlined fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                )}
                {file.hasOriginal && (
                  <Tooltip title={t('versions.listsRestore')}>
                    <span>
                      <IconButton
                        size="small"
                        color="primary"
                        disabled={busy}
                        onClick={() =>
                          void runAction(file.name, () => api.restoreVersionListFile(tag, file.name))
                        }
                      >
                        {busy ? (
                          <CircularProgress size={16} color="inherit" />
                        ) : (
                          <RestoreOutlined fontSize="small" />
                        )}
                      </IconButton>
                    </span>
                  </Tooltip>
                )}
                {canEdit && (
                  <Tooltip title={t('versions.listsDelete')}>
                    <span>
                      <IconButton
                        size="small"
                        color="error"
                        disabled={busy}
                        onClick={() => {
                          setDeleteTarget(file.name);
                          setDeleteOpen(true);
                        }}
                      >
                        <DeleteOutline fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                )}
              </Stack>
            </Box>
          );
        })}
      </Stack>
      <ListFileEditorDialog
        open={editorOpen}
        tag={tag}
        fileName={editingName}
        onClose={() => setEditorOpen(false)}
        onSaved={() => void refreshFiles()}
      />
      <Dialog
        open={deleteOpen}
        onClose={() => {
          if (actionBusy) return;
          setDeleteOpen(false);
        }}
        slotProps={{
          transition: {
            onExited: () => setDeleteTarget(null),
          },
        }}
      >
        <DialogTitle>
          {t('versions.listsDeleteConfirmTitle', { name: deleteTarget ?? '' })}
        </DialogTitle>
        <DialogContent>{t('versions.listsDeleteConfirmBody')}</DialogContent>
        <DialogActions>
          <Button
            variant="text"
            disabled={Boolean(actionBusy)}
            onClick={() => setDeleteOpen(false)}
          >
            {t('versions.cancel')}
          </Button>
          <Button
            color="error"
            disabled={!deleteTarget || Boolean(actionBusy)}
            startIcon={
              actionBusy === deleteTarget ? (
                <CircularProgress size={18} color="inherit" />
              ) : undefined
            }
            onClick={() => {
              if (!deleteTarget) return;
              const name = deleteTarget;
              void runAction(name, async () => {
                await api.deleteVersionListFile(tag, name);
                setDeleteOpen(false);
              });
            }}
          >
            {t('versions.listsDelete')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
