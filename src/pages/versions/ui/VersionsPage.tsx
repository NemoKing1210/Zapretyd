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
type NetworkStatus = 'ok' | 'offline' | 'unreachable';

export function VersionsPage({
  versions,
  latestTag,
  releaseCount,
  libraryPath,
  shortenPaths,
  releasesOnline,
  networkStatus,
  busy,
  error,
  installingTag,
  onInstall,
  onRemove,
  onOpen,
  onReleasesReachable,
}: {
  versions: InstalledVersion[];
  latestTag?: string;
  releaseCount?: number;
  libraryPath?: string;
  shortenPaths?: boolean;
  releasesOnline: boolean;
  networkStatus: NetworkStatus;
  busy: boolean;
  error?: string;
  installingTag?: string;
  onInstall: (release: ReleaseInfo, force?: boolean) => void;
  onRemove: (tag: string) => void;
  onOpen: (path: string) => void;
  onReleasesReachable: () => void;
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
        onReleasesReachable();
      } catch (cause) {
        setListError(translateError(String(cause)));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [onReleasesReachable, translateError],
  );

  useEffect(() => {
    if (view !== 'all' || loadedOnce || loading || !releasesOnline) return;
    void loadPage(1, false);
  }, [view, loadedOnce, loading, loadPage, releasesOnline]);

  const allCountLabel =
    releaseCount !== undefined ? String(releaseCount) : loadedOnce ? String(releases.length) : '…';

  const networkAlert =
    networkStatus === 'offline'
      ? t('versions.offline')
      : networkStatus === 'unreachable'
        ? t('versions.githubUnavailable')
        : null;

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h3">{t('versions.title')}</Typography>
        <Typography color="text.secondary" mt={1}>
          {t('versions.subtitle')}
        </Typography>
      </Box>
      {networkAlert && <Alert severity="warning">{networkAlert}</Alert>}
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
            libraryPath={libraryPath}
            shortenPaths={shortenPaths}
            onRemove={onRemove}
            onOpen={onOpen}
            onBrowseAll={() => setView('all')}
          />
        ) : (
          <AllReleasesList
            releases={releases}
            versions={versions}
            latestTag={latestTag}
            libraryPath={libraryPath}
            shortenPaths={shortenPaths}
            online={releasesOnline}
            loading={releasesOnline && (loading || (!loadedOnce && !listError))}
            loadingMore={loadingMore}
            hasMore={hasMore}
            error={listError || error}
            installingTag={busy ? installingTag : undefined}
            onLoadMore={() => void loadPage(page + 1, true)}
            onInstall={onInstall}
            onRemove={onRemove}
            onOpen={onOpen}
          />
        )}
      </PageTransition>
    </Stack>
  );
}
