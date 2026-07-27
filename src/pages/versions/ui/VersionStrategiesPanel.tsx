import { DescriptionOutlined } from '@mui/icons-material';
import { Alert, Box, Stack, Typography } from '@mui/material';
import type { StrategyInfo } from '../../../shared/api/zapretyd';
import { useTranslation } from '../../../shared/i18n';

function splitFileName(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return { base: name, ext: '' };
  return { base: name.slice(0, dot), ext: name.slice(dot) };
}

export function VersionStrategiesPanel({
  items,
  error,
}: {
  items: StrategyInfo[];
  error: string | null;
}) {
  const { t } = useTranslation();

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 0 }}>
        {error}
      </Alert>
    );
  }

  if (items.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        {t('versions.strategiesEmpty')}
      </Typography>
    );
  }

  return (
    <Stack spacing={1}>
      {items.map((strategy) => {
        const { base, ext } = splitFileName(strategy.name);
        return (
          <Box
            key={strategy.name}
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
              borderColor: 'divider',
              bgcolor: 'background.paper',
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
            <Typography
              variant="body2"
              noWrap
              title={strategy.name}
              sx={{
                minWidth: 0,
                flex: 1,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
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
          </Box>
        );
      })}
    </Stack>
  );
}
