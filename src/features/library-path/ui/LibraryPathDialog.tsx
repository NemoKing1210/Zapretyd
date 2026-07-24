import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Switch,
  TextField,
} from '@mui/material';
import { api, type AppSettings } from '../../../shared/api/zapretyd';
import { useTranslation } from '../../../shared/i18n';

export function LibraryPathDialog({
  settings,
  onSave,
}: {
  settings: AppSettings;
  onSave: (path: string) => Promise<void>;
}) {
  const { t, translateError } = useTranslation();
  const [useAppFolder, setUseAppFolder] = useState(true);
  const [defaultPath, setDefaultPath] = useState('');
  const [path, setPath] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api
      .defaultLibraryPath()
      .then((next) => {
        setDefaultPath(next);
        setPath(next);
      })
      .catch((cause) => setError(translateError(String(cause))));
  }, [translateError]);

  const choose = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: t('libraryDialog.pickerTitle'),
    });
    if (typeof selected === 'string') {
      setUseAppFolder(false);
      setPath(selected);
    }
  };

  const save = async () => {
    const nextPath = useAppFolder ? defaultPath : path.trim();
    if (!nextPath) return;
    setBusy(true);
    try {
      await onSave(nextPath);
      setError('');
    } catch (cause) {
      setError(translateError(String(cause)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!settings.libraryPath} maxWidth="sm" fullWidth>
      <DialogTitle>{t('libraryDialog.title')}</DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('libraryDialog.body', { path: 'C:\\Zapret' })}
        </Alert>
        <FormControlLabel
          control={
            <Switch
              checked={useAppFolder}
              disabled={busy || !defaultPath}
              onChange={(_, checked) => {
                setUseAppFolder(checked);
                if (checked && defaultPath) setPath(defaultPath);
              }}
            />
          }
          label={t('libraryDialog.useAppStorage')}
          sx={{ mb: 1 }}
        />
        {!useAppFolder && (
          <>
            <TextField
              autoFocus
              fullWidth
              label={t('libraryDialog.folderLabel')}
              value={path}
              onChange={(e) => setPath(e.target.value)}
            />
            <Button variant="text" sx={{ mt: 1 }} onClick={choose} disabled={busy}>
              {t('libraryDialog.chooseFolder')}
            </Button>
          </>
        )}
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button
          variant="contained"
          disabled={busy || (useAppFolder ? !defaultPath : !path.trim())}
          onClick={save}
        >
          {t('libraryDialog.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
