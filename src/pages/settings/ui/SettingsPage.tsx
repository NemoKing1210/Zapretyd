import { useEffect, useState } from 'react';
import { FolderOpenOutlined } from '@mui/icons-material';
import { open } from '@tauri-apps/plugin-dialog';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  Typography,
} from '@mui/material';
import { api, type AppSettings } from '../../../shared/api/zapretyd';
import {
  normalizeLocalePreference,
  useTranslation,
  type LocalePreference,
} from '../../../shared/i18n';

export function SettingsPage({
  settings,
  onSave,
}: {
  settings: AppSettings;
  onSave: (settings: AppSettings) => Promise<void>;
}) {
  const { t, localePreference, setLocalePreference } = useTranslation();
  const [defaultPath, setDefaultPath] = useState('');
  const useAppFolder = Boolean(defaultPath && settings.libraryPath === defaultPath);

  useEffect(() => {
    void api.defaultLibraryPath().then(setDefaultPath);
  }, []);

  const choose = async () => {
    const path = await open({ directory: true, multiple: false });
    if (typeof path === 'string') onSave({ ...settings, libraryPath: path });
  };

  const toggleAppFolder = async (checked: boolean) => {
    if (checked) {
      const libraryPath = defaultPath || (await api.defaultLibraryPath());
      await onSave({ ...settings, libraryPath });
      return;
    }
    await choose();
  };

  const changeLocale = async (preference: LocalePreference) => {
    setLocalePreference(preference);
    await onSave({ ...settings, locale: preference });
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h3">{t('settings.title')}</Typography>
        <Typography color="text.secondary" mt={1}>
          {t('settings.subtitle')}
        </Typography>
      </Box>
      <Card>
        <CardContent>
          <Typography variant="h6">{t('settings.libraryTitle')}</Typography>
          <Typography color="text.secondary" sx={{ mt: 1, wordBreak: 'break-all' }}>
            {settings.libraryPath ?? t('settings.libraryNotSelected')}
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={useAppFolder}
                disabled={!defaultPath}
                onChange={(_, checked) => void toggleAppFolder(checked)}
              />
            }
            label={t('settings.useAppFolder')}
            sx={{ mt: 1, display: 'flex' }}
          />
          {!useAppFolder && (
            <Button variant="text" startIcon={<FolderOpenOutlined />} onClick={choose}>
              {t('settings.changeFolder')}
            </Button>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <FormControl fullWidth>
            <InputLabel id="settings-language-label">{t('settings.language')}</InputLabel>
            <Select
              labelId="settings-language-label"
              label={t('settings.language')}
              value={normalizeLocalePreference(settings.locale ?? localePreference)}
              onChange={(event) => void changeLocale(event.target.value as LocalePreference)}
            >
              <MenuItem value="system">{t('settings.languageSystem')}</MenuItem>
              <MenuItem value="en">{t('settings.languageEn')}</MenuItem>
              <MenuItem value="ru">{t('settings.languageRu')}</MenuItem>
            </Select>
          </FormControl>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <FormControlLabel
            control={
              <Switch
                checked={settings.autoCheckUpdates}
                onChange={(event) =>
                  onSave({ ...settings, autoCheckUpdates: event.target.checked })
                }
              />
            }
            label={t('settings.autoCheckUpdates')}
          />
          <Typography variant="body2" color="text.secondary">
            {t('settings.autoCheckHint')}
          </Typography>
        </CardContent>
      </Card>
      <Alert severity="info">{t('settings.githubInfo')}</Alert>
    </Stack>
  );
}
