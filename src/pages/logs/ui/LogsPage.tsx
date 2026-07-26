import { DeleteOutline, RestartAlt } from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { getLocale, useTranslation } from '../../../shared/i18n';
import {
  clearErrorLog,
  useErrorLog,
  type ErrorLogEntry,
} from '../../../shared/lib/errorLog';

function formatLogTime(at: number): string {
  return new Intl.DateTimeFormat(getLocale() === 'ru' ? 'ru-RU' : 'en-US', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(at));
}

function LogEntry({ entry }: { entry: ErrorLogEntry }) {
  const showRaw = entry.raw !== entry.message;
  return (
    <Box
      component="article"
      sx={{
        py: 1.5,
        px: 2,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap mb={0.75}>
        <Typography variant="caption" color="text.secondary" fontFamily="monospace">
          {formatLogTime(entry.at)}
        </Typography>
        <Chip size="small" label={entry.source} variant="outlined" sx={{ height: 22 }} />
      </Stack>
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {entry.message}
      </Typography>
      {showRaw && (
        <Typography
          variant="caption"
          color="text.secondary"
          component="pre"
          sx={{
            mt: 1,
            m: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          }}
        >
          {entry.raw}
        </Typography>
      )}
    </Box>
  );
}

export function LogsPage({
  cachedLatestTag,
  onClearCachedLatestTag,
}: {
  cachedLatestTag?: string;
  onClearCachedLatestTag: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const entries = useErrorLog();
  const [clearingTag, setClearingTag] = useState(false);

  const clearCachedTag = async () => {
    setClearingTag(true);
    try {
      await onClearCachedLatestTag();
    } finally {
      setClearingTag(false);
    }
  };

  return (
    <Stack spacing={2.5}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        alignItems={{ sm: 'flex-start' }}
        justifyContent="space-between"
      >
        <Box>
          <Typography variant="h4" fontWeight={800} letterSpacing="-.03em">
            {t('logs.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            {t('logs.subtitle')}
          </Typography>
        </Box>
        <Button
          size="small"
          color="inherit"
          startIcon={<DeleteOutline />}
          onClick={clearErrorLog}
          disabled={entries.length === 0}
          sx={{ alignSelf: { xs: 'stretch', sm: 'center' }, flexShrink: 0 }}
        >
          {t('logs.clear')}
        </Button>
      </Stack>

      <Card>
        <CardContent>
          <Typography variant="overline" color="text.secondary">
            {t('logs.debugTitle')}
          </Typography>
          <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5, mb: 2 }}>
            {t('logs.debugHint')}
          </Typography>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.5}
            alignItems={{ sm: 'center' }}
            justifyContent="space-between"
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary" display="block">
                {t('logs.cachedLatestTag')}
              </Typography>
              <Typography
                variant="body2"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
                sx={{ wordBreak: 'break-all' }}
              >
                {cachedLatestTag || t('logs.cachedLatestTagEmpty')}
              </Typography>
            </Box>
            <Button
              size="small"
              color="warning"
              variant="outlined"
              startIcon={<RestartAlt />}
              onClick={() => void clearCachedTag()}
              disabled={clearingTag || !cachedLatestTag}
              sx={{ flexShrink: 0, alignSelf: { xs: 'stretch', sm: 'center' } }}
            >
              {t('logs.clearCachedLatestTag')}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {entries.length === 0 ? (
        <Alert severity="info">{t('logs.empty')}</Alert>
      ) : (
        <Stack spacing={1.25}>
          <Typography variant="caption" color="text.secondary">
            {t('logs.count', { count: entries.length })}
          </Typography>
          {entries.map((entry) => (
            <LogEntry key={entry.id} entry={entry} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
