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
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [original, setOriginal] = useState('');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const extensions = useMemo(
    () => [
      EditorView.lineWrapping,
      EditorView.theme({
        '&': { height: '100%', fontSize: '13px' },
        '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
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
    <Dialog
      open={open}
      onClose={handleClose}
      fullWidth
      maxWidth="md"
      slotProps={{
        paper: {
          sx: {
            height: 'min(80vh, 720px)',
            display: 'flex',
            flexDirection: 'column',
          },
        },
      }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Stack spacing={0.25}>
          <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.2 }}>
            {t('versions.lists')}
          </Typography>
          <Typography component="span" variant="h6" sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>
            {fileName ?? t('versions.lists')}
          </Typography>
        </Stack>
      </DialogTitle>
      <DialogContent
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
          overflow: 'hidden',
          px: 2,
          pb: 1,
        }}
      >
        {error && <Alert severity="error">{error}</Alert>}
        {loading ? (
          <Box flex={1} display="flex" alignItems="center" justifyContent="center">
            <CircularProgress size={28} />
          </Box>
        ) : (
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              overflow: 'hidden',
              border: 1,
              borderColor: 'divider',
              borderRadius: 2,
              bgcolor: 'action.hover',
              '& .cm-editor': { height: '100%', outline: 'none' },
              '& .cm-focused': { outline: 'none' },
            }}
          >
            <CodeMirror
              value={draft}
              height="100%"
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
