import { type ReactNode } from 'react';
import {
  DeleteOutline,
  FolderOpenOutlined,
  GitHub,
  LanguageOutlined,
  OpenInNewOutlined,
} from '@mui/icons-material';
import { useColorScheme } from '@mui/material/styles';
import {
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  Link,
  MenuItem,
  Select,
  Stack,
  Switch,
  Typography,
} from '@mui/material';
import GB from 'country-flag-icons/react/3x2/GB';
import RU from 'country-flag-icons/react/3x2/RU';
import {
  api,
  normalizeThemeMode,
  type AppSettings,
  type ThemeMode,
} from '../../../shared/api/zapretyd';
import {
  normalizeLocalePreference,
  useTranslation,
  type LocalePreference,
} from '../../../shared/i18n';
import { reportCaughtError } from '../../../shared/lib/errorLog';
import { useToast } from '../../../shared/ui/toast';

const PROJECT_REPO_URL = 'https://github.com/NemoKing1210/Zapretyd';
const AUTHOR_URL = 'https://github.com/NemoKing1210';
const UPSTREAM_REPO_URL = 'https://github.com/Flowseal/zapret-discord-youtube';
const UPSTREAM_REPO_LABEL = 'Flowseal/zapret-discord-youtube';
const PROJECT_REPO_LABEL = 'NemoKing1210/Zapretyd';

const flagSx = {
  width: 20,
  height: 'auto',
  borderRadius: '2px',
  flexShrink: 0,
  boxShadow: '0 0 0 1px rgba(0,0,0,.12)',
} as const;

function LocaleFlag({ preference }: { preference: LocalePreference }) {
  if (preference === 'en') return <GB title="English" style={flagSx} />;
  if (preference === 'ru') return <RU title="Русский" style={flagSx} />;
  return <LanguageOutlined sx={{ fontSize: 20, color: 'text.secondary', flexShrink: 0 }} />;
}

function LocaleOption({ preference, label }: { preference: LocalePreference; label: string }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.25 }}>
      <LocaleFlag preference={preference} />
      {label}
    </Box>
  );
}

function SettingsSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardContent>
        <Typography variant="overline" color="text.secondary">
          {title}
        </Typography>
        <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5, mb: 2 }}>
          {hint}
        </Typography>
        {children}
      </CardContent>
    </Card>
  );
}

export function SettingsPage({
  settings,
  onSave,
}: {
  settings: AppSettings;
  onSave: (settings: AppSettings, reason?: 'theme' | 'locale') => Promise<void>;
}) {
  const { t, translateError, localePreference, setLocalePreference } = useTranslation();
  const { showToast } = useToast();
  const { setMode } = useColorScheme();
  const appVersion = import.meta.env.VITE_APP_VERSION as string;
  const themeMode = normalizeThemeMode(settings.theme);

  const changeLocale = async (preference: LocalePreference) => {
    setLocalePreference(preference);
    await onSave({ ...settings, locale: preference }, 'locale');
  };

  const changeTheme = async (next: ThemeMode) => {
    setMode(next);
    await onSave({ ...settings, theme: next }, 'theme');
  };

  const changeAutostart = async (enabled: boolean) => {
    await onSave({ ...settings, autostart: enabled });
  };

  const changeStartMinimized = async (enabled: boolean) => {
    await onSave({ ...settings, startMinimized: enabled });
  };

  const openExternal = (url: string) => {
    void api.openUrl(url);
  };

  const clearLogs = async () => {
    try {
      await api.clearErrorLogs();
      showToast({
        title: t('toast.logsCleared.title'),
        description: t('toast.logsCleared.body'),
      });
    } catch (cause) {
      reportCaughtError(cause, { source: 'settings.clearLogs', translate: translateError });
      showToast({
        title: t('toast.error.title'),
        description: translateError(String(cause)) || t('toast.error.body'),
        severity: 'error',
      });
    }
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h3">{t('settings.title')}</Typography>
        <Typography color="text.secondary" mt={1}>
          {t('settings.subtitle')}
        </Typography>
      </Box>

      <SettingsSection title={t('settings.appearanceTitle')} hint={t('settings.appearanceHint')}>
        <Stack spacing={2.5}>
          <Box>
            <FormControl fullWidth>
              <InputLabel id="settings-theme-label">{t('settings.theme')}</InputLabel>
              <Select
                labelId="settings-theme-label"
                label={t('settings.theme')}
                value={themeMode}
                onChange={(event) => void changeTheme(event.target.value as ThemeMode)}
              >
                <MenuItem value="system">{t('settings.themeSystem')}</MenuItem>
                <MenuItem value="light">{t('settings.themeLight')}</MenuItem>
                <MenuItem value="dark">{t('settings.themeDark')}</MenuItem>
              </Select>
            </FormControl>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {t('settings.themeHint')}
            </Typography>
          </Box>
          <Box>
            <FormControl fullWidth>
              <InputLabel id="settings-language-label">{t('settings.language')}</InputLabel>
              <Select
                labelId="settings-language-label"
                label={t('settings.language')}
                value={normalizeLocalePreference(settings.locale ?? localePreference)}
                onChange={(event) => void changeLocale(event.target.value as LocalePreference)}
                renderValue={(value) => {
                  const preference = normalizeLocalePreference(value);
                  const label =
                    preference === 'system'
                      ? t('settings.languageSystem')
                      : preference === 'en'
                        ? t('settings.languageEn')
                        : t('settings.languageRu');
                  return <LocaleOption preference={preference} label={label} />;
                }}
              >
                <MenuItem value="system">
                  <LocaleOption preference="system" label={t('settings.languageSystem')} />
                </MenuItem>
                <MenuItem value="en">
                  <LocaleOption preference="en" label={t('settings.languageEn')} />
                </MenuItem>
                <MenuItem value="ru">
                  <LocaleOption preference="ru" label={t('settings.languageRu')} />
                </MenuItem>
              </Select>
            </FormControl>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {t('settings.languageHint')}
            </Typography>
          </Box>
        </Stack>
      </SettingsSection>

      <SettingsSection title={t('settings.startupTitle')} hint={t('settings.startupHint')}>
        <Stack spacing={1.5}>
          <Box>
            <FormControlLabel
              control={
                <Switch
                  checked={Boolean(settings.autostart)}
                  onChange={(_, checked) => void changeAutostart(checked)}
                />
              }
              label={t('settings.autostart')}
              sx={{ display: 'flex' }}
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, ml: 5.75 }}>
              {t('settings.autostartHint')}
            </Typography>
          </Box>
          {Boolean(settings.autostart) && (
            <Box>
              <FormControlLabel
                control={
                  <Switch
                    checked={Boolean(settings.startMinimized)}
                    onChange={(_, checked) => void changeStartMinimized(checked)}
                  />
                }
                label={t('settings.startMinimized')}
                sx={{ display: 'flex' }}
              />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, ml: 5.75 }}>
                {t('settings.startMinimizedHint')}
              </Typography>
            </Box>
          )}
        </Stack>
      </SettingsSection>

      {!import.meta.env.DEV && (
        <SettingsSection title={t('settings.logsTitle')} hint={t('settings.logsHint')}>
          <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap">
            <Button
              variant="outlined"
              startIcon={<FolderOpenOutlined />}
              onClick={() => void api.openLogsDirectory()}
            >
              {t('settings.openLogsFolder')}
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteOutline />}
              onClick={() => void clearLogs()}
            >
              {t('settings.clearLogs')}
            </Button>
          </Stack>
        </SettingsSection>
      )}

      <SettingsSection
        title={t('settings.aboutTitle')}
        hint={t('settings.aboutVersion', { version: appVersion })}
      >
        <Typography sx={{ mb: 2 }}>{t('settings.aboutBody')}</Typography>
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="body2" color="text.secondary">
              {t('settings.aboutAuthor')}
            </Typography>
            <Link
              component="button"
              type="button"
              variant="body1"
              onClick={() => openExternal(AUTHOR_URL)}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                mt: 0.25,
                cursor: 'pointer',
              }}
            >
              {t('settings.aboutAuthorName')}
              <OpenInNewOutlined sx={{ fontSize: 16 }} />
            </Link>
          </Box>
          <Box>
            <Typography variant="body2" color="text.secondary">
              {t('settings.aboutProject')}
            </Typography>
            <Link
              component="button"
              type="button"
              variant="body1"
              onClick={() => openExternal(PROJECT_REPO_URL)}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                mt: 0.25,
                cursor: 'pointer',
              }}
            >
              {PROJECT_REPO_LABEL}
              <OpenInNewOutlined sx={{ fontSize: 16 }} />
            </Link>
          </Box>
          <Button
            variant="outlined"
            startIcon={<GitHub />}
            onClick={() => openExternal(PROJECT_REPO_URL)}
            sx={{ alignSelf: 'flex-start', mt: 1 }}
          >
            {t('settings.openGitHub')}
          </Button>
          <Divider sx={{ my: 0.5 }} />
          <Box>
            <Typography variant="body2" color="text.secondary">
              {t('settings.upstreamRepo')}
            </Typography>
            <Link
              component="button"
              type="button"
              variant="body1"
              onClick={() => openExternal(UPSTREAM_REPO_URL)}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                mt: 0.25,
                cursor: 'pointer',
              }}
            >
              {UPSTREAM_REPO_LABEL}
              <OpenInNewOutlined sx={{ fontSize: 16 }} />
            </Link>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {t('settings.updatesHint')}
            </Typography>
          </Box>
        </Stack>
      </SettingsSection>
    </Stack>
  );
}
