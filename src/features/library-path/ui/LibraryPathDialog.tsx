import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from '@mui/material';
import type { AppSettings } from '../../../shared/api/zapretyd';
import { useTranslation } from '../../../shared/i18n';

export function LibraryPathDialog({
  settings,
  onSave,
}: {
  settings: AppSettings;
  onSave: (path: string) => Promise<void>;
}) {
  const { t, translateError } = useTranslation();
  const [path, setPath] = useState(settings.libraryPath ?? '');
  const [error, setError] = useState('');
  const choose = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: t('libraryDialog.pickerTitle'),
    });
    if (typeof selected === 'string') setPath(selected);
  };
  const save = async () => {
    try {
      await onSave(path);
      setError('');
    } catch (e) {
      setError(translateError(String(e)));
    }
  };
  return (
    <Dialog open={!settings.libraryPath} maxWidth="sm" fullWidth>
      <DialogTitle>{t('libraryDialog.title')}</DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('libraryDialog.body', { path: 'C:\\Zapret' })}
        </Alert>
        <TextField
          autoFocus
          fullWidth
          label={t('libraryDialog.folderLabel')}
          value={path}
          onChange={(e) => setPath(e.target.value)}
        />
        <Button variant="text" sx={{ mt: 1 }} onClick={choose}>
          {t('libraryDialog.chooseFolder')}
        </Button>
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button disabled={!path.trim()} onClick={save}>
          {t('libraryDialog.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
