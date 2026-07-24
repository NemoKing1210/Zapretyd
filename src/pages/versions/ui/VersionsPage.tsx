import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import {
  api,
  type InstalledVersion,
  type ReleaseInfo,
} from '../../../shared/api/zapretyd';
import { useTranslation } from '../../../shared/i18n';
import { PageTransition } from '../../../shared/ui/PageTransition';
import { AllReleasesList } from './AllReleasesList';
import { InstalledVersionsList } from './InstalledVersionsList';

type ViewMode = 'installed' | 'all';

export function VersionsPage({
  versions,
  latestTag,
  releaseCount,
  online,
  busy,
  error,
  installingTag,
  onInstall,
  onRemove,
  onOpen,
}: {
  versions: InstalledVersion[];
  latestTag?: string;
  releaseCount?: number;
  online: boolean;
  busy: boolean;
  error?: string;
  installingTag?: string;
  onInstall: (release: ReleaseInfo, force?: boolean) => void;
  onRemove: (tag: string) => void;
  onOpen: (path: string) => void;
}) {
  const { t, translateError } = useTranslation();
  const [view, setView] = useState<ViewMode>('installed');
  const [releases, setReleases] = useState<ReleaseInfo[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState('');
  const [loadedOnce, setLoadedOnce] = useState(false);

  const loadPage = useCallback(
    async (nextPage: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setListError('');
      try {
        const result = await api.listReleases(nextPage);
        setReleases((prev) => (append ? [...prev, ...result.releases] : result.releases));
        setPage(result.page);
        setHasMore(result.hasMore);
        setLoadedOnce(true);
      } catch (cause) {
        setListError(translateError(String(cause)));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [translateError],
  );

  useEffect(() => {
    if (view !== 'all' || loadedOnce || loading || !online) return;
    void loadPage(1, false);
  }, [view, loadedOnce, loading, loadPage, online]);

  const allCountLabel =
    releaseCount !== undefined ? String(releaseCount) : loadedOnce ? String(releases.length) : '…';

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h3">{t('versions.title')}</Typography>
        <Typography color="text.secondary" mt={1}>
          {t('versions.subtitle')}
        </Typography>
      </Box>
      {!online && <Alert severity="warning">{t('versions.offline')}</Alert>}
      <ToggleButtonGroup
        exclusive
        color="primary"
        value={view}
        onChange={(_, next: ViewMode | null) => {
          if (next) setView(next);
        }}
        aria-label={t('versions.title')}
      >
        <ToggleButton value="installed" sx={{ gap: 1, px: 2 }}>
          {t('versions.tabInstalled')}
          <Chip
            size="small"
            label={versions.length}
            sx={{ height: 22, pointerEvents: 'none' }}
          />
        </ToggleButton>
        <ToggleButton value="all" sx={{ gap: 1, px: 2 }}>
          {t('versions.tabAll')}
          <Chip size="small" label={allCountLabel} sx={{ height: 22, pointerEvents: 'none' }} />
        </ToggleButton>
      </ToggleButtonGroup>
      {error && view === 'installed' && <Alert severity="error">{error}</Alert>}
      <PageTransition pageKey={view}>
        {view === 'installed' ? (
          <InstalledVersionsList
            versions={versions}
            latestTag={latestTag}
            onRemove={onRemove}
            onOpen={onOpen}
            onBrowseAll={() => setView('all')}
          />
        ) : (
          <AllReleasesList
            releases={releases}
            versions={versions}
            latestTag={latestTag}
            online={online}
            loading={online && (loading || (!loadedOnce && !listError))}
            loadingMore={loadingMore}
            hasMore={hasMore}
            error={listError || error}
            installingTag={busy ? installingTag : undefined}
            onLoadMore={() => void loadPage(page + 1, true)}
            onInstall={onInstall}
            onRemove={onRemove}
          />
        )}
      </PageTransition>
    </Stack>
  );
}
