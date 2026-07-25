import { useCallback, useEffect, useState } from 'react';
import { DescriptionOutlined, EditOutlined } from '@mui/icons-material';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Stack,
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

export function VersionListsPanel({ tag, active }: { tag: string; active: boolean }) {
  const { t, translateError } = useTranslation();
  const [files, setFiles] = useState<ListFileInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const loadFiles = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .listVersionListFiles(tag)
      .then(setFiles)
      .catch((cause) => {
        setFiles([]);
        setError(translateError(String(cause)));
      })
      .finally(() => setLoading(false));
  }, [tag, translateError]);

  useEffect(() => {
    if (!active) return;
    loadFiles();
  }, [active, loadFiles]);

  const openEditor = (name: string) => {
    setEditingName(name);
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
  };

  if (loading && files.length === 0 && !error) {
    return (
      <Box display="flex" justifyContent="center" py={2}>
        <CircularProgress size={24} />
      </Box>
    );
  }

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
        {files.map((file) => {
          const { base, ext } = splitFileName(file.name);
          return (
            <Box
              key={file.name}
              component="button"
              type="button"
              onClick={() => openEditor(file.name)}
              sx={{
                all: 'unset',
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                width: '100%',
                boxSizing: 'border-box',
                px: 1.5,
                py: 1.25,
                borderRadius: 2,
                border: 1,
                borderColor: 'divider',
                bgcolor: 'background.paper',
                cursor: 'pointer',
                transition: (theme) =>
                  theme.transitions.create(['border-color', 'background-color', 'box-shadow'], {
                    duration: theme.transitions.duration.shorter,
                  }),
                '&:hover': {
                  borderColor: 'primary.main',
                  bgcolor: 'action.hover',
                  '& .lists-edit-icon': { opacity: 1 },
                },
                '&:focus-visible': {
                  outline: '2px solid',
                  outlineColor: 'primary.main',
                  outlineOffset: 2,
                },
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
                  color: 'primary.main',
                }}
              >
                <DescriptionOutlined fontSize="small" />
              </Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography
                  variant="body2"
                  noWrap
                  title={file.name}
                  sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}
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
                <Typography variant="caption" color="text.secondary">
                  {t('versions.listsEditHint')}
                </Typography>
              </Box>
              <Chip size="small" label={formatBytes(file.size)} sx={{ flexShrink: 0 }} />
              <EditOutlined
                className="lists-edit-icon"
                fontSize="small"
                sx={{ color: 'text.secondary', opacity: 0.45, flexShrink: 0 }}
              />
            </Box>
          );
        })}
      </Stack>
      <ListFileEditorDialog
        open={editorOpen}
        tag={tag}
        fileName={editingName}
        onClose={closeEditor}
        onSaved={loadFiles}
      />
    </>
  );
}
