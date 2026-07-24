import { FolderOpenOutlined } from '@mui/icons-material';
import { open } from '@tauri-apps/plugin-dialog';
import { Alert, Box, Button, Card, CardContent, FormControlLabel, Stack, Switch, Typography } from '@mui/material';
import type { AppSettings } from '../../../shared/api/zapretyd';
import { useTranslation } from '../../../shared/i18n';

export function SettingsPage({ settings, onSave }: { settings: AppSettings; onSave: (settings: AppSettings) => Promise<void> }) {
  const { t } = useTranslation();
  const choose = async () => { const path = await open({ directory: true, multiple: false }); if (typeof path === 'string') onSave({ ...settings, libraryPath: path }); };
  return <Stack spacing={3}><Box><Typography variant="h3">{t('settings.title')}</Typography><Typography color="text.secondary" mt={1}>{t('settings.subtitle')}</Typography></Box><Card><CardContent><Typography variant="h6">{t('settings.libraryTitle')}</Typography><Typography color="text.secondary" sx={{ mt: 1, wordBreak: 'break-all' }}>{settings.libraryPath ?? t('settings.libraryNotSelected')}</Typography><Button variant="text" sx={{ mt: 1 }} startIcon={<FolderOpenOutlined />} onClick={choose}>{t('settings.changeFolder')}</Button></CardContent></Card><Card><CardContent><FormControlLabel control={<Switch checked={settings.autoCheckUpdates} onChange={(event) => onSave({ ...settings, autoCheckUpdates: event.target.checked })} />} label={t('settings.autoCheckUpdates')} /><Typography variant="body2" color="text.secondary">{t('settings.autoCheckHint')}</Typography></CardContent></Card><Alert severity="info">{t('settings.githubInfo')}</Alert></Stack>;
}
