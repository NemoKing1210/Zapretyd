import { useState } from 'react';
import { DescriptionOutlined, PlayArrowOutlined } from '@mui/icons-material';
import { Alert, Box, Button, Chip, CircularProgress, Stack, Typography } from '@mui/material';
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
  isAdmin = false,
  versionIsActive = false,
  activeStrategy,
  activateBusy = false,
  onActivate,
}: {
  items: StrategyInfo[];
  error: string | null;
  isAdmin?: boolean;
  versionIsActive?: boolean;
  activeStrategy?: string;
  activateBusy?: boolean;
  onActivate?: (strategy: StrategyInfo) => void | Promise<void>;
}) {
  const { t, translateError } = useTranslation();
  const [activatingName, setActivatingName] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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
      {actionError && (
        <Alert severity="error" onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}
      {items.map((strategy) => {
        const { base, ext } = splitFileName(strategy.name);
        const isActive =
          versionIsActive && Boolean(activeStrategy) && strategy.name === activeStrategy;
        const rowBusy = activatingName === strategy.name;
        const busy = activateBusy || activatingName !== null;
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
              borderColor: isActive ? 'secondary.main' : 'divider',
              bgcolor: isActive ? 'action.hover' : 'background.paper',
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
                color: isActive ? 'secondary.main' : 'primary.main',
              }}
            >
              <DescriptionOutlined fontSize="small" />
            </Box>
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              flexWrap="wrap"
              useFlexGap
              sx={{ minWidth: 0, flex: 1 }}
            >
              <Typography
                variant="body2"
                noWrap
                title={strategy.name}
                sx={{
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
              {isActive && <Chip label={t('versions.active')} color="secondary" size="small" />}
            </Stack>
            <Button
              size="small"
              color="primary"
              disabled={!isAdmin || isActive || busy || !onActivate}
              startIcon={
                rowBusy ? <CircularProgress size={16} color="inherit" /> : <PlayArrowOutlined />
              }
              onClick={() => {
                if (!onActivate) return;
                setActionError(null);
                setActivatingName(strategy.name);
                void Promise.resolve(onActivate(strategy))
                  .catch((cause) => {
                    setActionError(translateError(String(cause)));
                  })
                  .finally(() => {
                    setActivatingName(null);
                  });
              }}
              sx={{ flexShrink: 0 }}
            >
              {t('versions.installStrategy')}
            </Button>
          </Box>
        );
      })}
    </Stack>
  );
}
