import { useEffect, useMemo, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
  useTheme,
} from '@mui/material';
import { api } from '../../../shared/api/zapretyd';
import { useTranslation } from '../../../shared/i18n';

function resolveEditorHeight(): number {
  if (typeof window === 'undefined') return 480;
  return Math.max(240, Math.min(560, Math.round(window.innerHeight * 0.8) - 180));
}

export function ListFileEditorDialog({
  open,
  tag,
  fileName,
  onClose,
  onSaved,
}: {
  open: boolean;
  tag: string;
  fileName: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, translateError } = useTranslation();
  const theme = useTheme();
  const [editorHeight, setEditorHeight] = useState(resolveEditorHeight);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [original, setOriginal] = useState('');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const extensions = useMemo(
    () => [
      EditorView.lineWrapping,
      EditorView.theme({
        '&': { fontSize: '13px' },
        '.cm-scroller': {
          overflow: 'auto !important',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        },
        '.cm-content': { padding: '12px 0' },
        '.cm-gutters': {
          border: 'none',
          backgroundColor: 'transparent',
        },
      }),
    ],
    [],
  );

  useEffect(() => {
    if (!open) return;
    const syncHeight = () => setEditorHeight(resolveEditorHeight());
    syncHeight();
    window.addEventListener('resize', syncHeight);
    return () => window.removeEventListener('resize', syncHeight);
  }, [open]);

  useEffect(() => {
    if (!open || !fileName) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setOriginal('');
    setDraft('');
    api
      .readVersionListFile(tag, fileName)
      .then((content) => {
        if (cancelled) return;
        setOriginal(content);
        setDraft(content);
      })
      .catch((cause) => {
        if (cancelled) return;
        setError(translateError(String(cause)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, tag, fileName, translateError]);

  const dirty = draft !== original;
  const canClose = !saving;
  const editorTheme = theme.palette.mode === 'dark' ? 'dark' : 'light';

  const handleClose = () => {
    if (!canClose) return;
    onClose();
  };

  const handleApply = async () => {
    if (!fileName || !dirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.writeVersionListFile(tag, fileName, draft);
      onSaved();
      onClose();
    } catch (cause) {
      setError(translateError(String(cause)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ pb: 1 }}>
        <Stack spacing={0.25}>
          <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.2 }}>
            {t('versions.lists')}
          </Typography>
          <Typography
            component="span"
            variant="h6"
            sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}
          >
            {fileName ?? t('versions.lists')}
          </Typography>
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ overflow: 'hidden', px: 2, pb: 1 }}>
        <Stack spacing={1.5}>
          {error && <Alert severity="error">{error}</Alert>}
          {loading ? (
            <Box display="flex" justifyContent="center" py={6}>
              <CircularProgress size={28} />
            </Box>
          ) : (
            <Box
              sx={{
                border: 1,
                borderColor: 'divider',
                borderRadius: 2,
                overflow: 'hidden',
                bgcolor: 'action.hover',
                '& .cm-editor': { outline: 'none' },
                '& .cm-focused': { outline: 'none' },
              }}
            >
              <CodeMirror
                value={draft}
                height={`${editorHeight}px`}
                width="100%"
                theme={editorTheme}
                editable={!(Boolean(error) && !original)}
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: false,
                  highlightActiveLineGutter: true,
                  highlightActiveLine: true,
                  bracketMatching: false,
                  closeBrackets: false,
                  autocompletion: false,
                  searchKeymap: true,
                }}
                extensions={extensions}
                onChange={setDraft}
              />
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 2 }}>
        <Button variant="text" disabled={!canClose} onClick={handleClose}>
          {t('versions.cancel')}
        </Button>
        <Button
          disabled={loading || saving || !dirty || !fileName}
          startIcon={saving ? <CircularProgress size={18} color="inherit" /> : undefined}
          onClick={() => void handleApply()}
        >
          {t('versions.listsApply')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
