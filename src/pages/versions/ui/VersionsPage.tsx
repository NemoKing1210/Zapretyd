import { useCallback, useEffect, useState } from 'react';
import {
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
import { reportCaughtError } from '../../../shared/lib/errorLog';
import { ErrorAlert } from '../../../shared/ui/ErrorAlert';
import { PageTransition } from '../../../shared/ui/PageTransition';
import { AllReleasesList } from './AllReleasesList';
import { InstalledVersionsList } from './InstalledVersionsList';

type ViewMode = 'installed' | 'all';
type NetworkStatus = 'ok' | 'offline' | 'unreachable';

export type VersionsTab = ViewMode;

export function VersionsPage({
  versions,
  latestTag,
  libraryPath,
  shortenPaths,
  releasesOnline,
  networkStatus,
  networkError,
  busy,
  error,
  installingTag,
  view: viewProp,
  onViewChange,
  onInstall,
  onRemove,
  onOpen,
  onReleasesReachable,
}: {
  versions: InstalledVersion[];
  latestTag?: string;
  libraryPath?: string;
  shortenPaths?: boolean;
  releasesOnline: boolean;
  networkStatus: NetworkStatus;
  networkError?: string;
  busy: boolean;
  error?: string;
  installingTag?: string;
  view?: VersionsTab;
  onViewChange?: (view: VersionsTab) => void;
  onInstall: (release: ReleaseInfo, force?: boolean) => void | Promise<void>;
  onRemove: (tag: string) => void;
  onOpen: (path: string) => void;
  onReleasesReachable: () => void;
}) {
  const { t, translateError } = useTranslation();
  const [uncontrolledView, setUncontrolledView] = useState<ViewMode>('installed');
  const view = viewProp ?? uncontrolledView;
  const setView = (next: ViewMode) => {
    onViewChange?.(next);
    if (viewProp === undefined) setUncontrolledView(next);
  };
  const [releases, setReleases] = useState<ReleaseInfo[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState('');
  const [actionError, setActionError] = useState('');
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
        const raw = String(cause);
        reportCaughtError(cause, { source: 'releases.list', translate: translateError });
        setListError(raw);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [onReleasesReachable, translateError],
  );

  const reinstallTag = useCallback(
    async (tag: string) => {
      setActionError('');
      try {
        const cached = releases.find((release) => release.tag === tag);
        const release = cached ?? (await api.getRelease(tag));
        await onInstall(release, true);
      } catch (cause) {
        const raw = String(cause);
        reportCaughtError(cause, {
          source: 'releases.reinstall',
          translate: translateError,
        });
        setActionError(raw);
        throw cause;
      }
    },
    [onInstall, releases, translateError],
  );

  useEffect(() => {
    if (view !== 'all' || loadedOnce || loading || listError || !releasesOnline) return;
    void loadPage(1, false);
  }, [view, loadedOnce, loading, listError, loadPage, releasesOnline]);

  const networkAlert =
    networkStatus === 'offline'
      ? t('versions.offline')
      : networkStatus === 'unreachable'
        ? t('versions.githubUnavailable')
        : null;

  const installedError = actionError || error;

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h3">{t('versions.title')}</Typography>
        <Typography color="text.secondary" mt={1}>
          {t('versions.subtitle')}
        </Typography>
      </Box>
      {networkAlert && (
        <ErrorAlert
          severity="warning"
          message={networkAlert}
          details={
            networkError
              ? `${networkError}\n\nnavigator.onLine: ${String(navigator.onLine)}\nnetworkStatus: ${networkStatus}`
              : undefined
          }
        />
      )}
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
        </ToggleButton>
      </ToggleButtonGroup>
      {installedError && view === 'installed' && (
        <ErrorAlert message={t('error.generic')} details={installedError} />
      )}
      <PageTransition pageKey={view}>
        {view === 'installed' ? (
          <InstalledVersionsList
            versions={versions}
            latestTag={latestTag}
            libraryPath={libraryPath}
            shortenPaths={shortenPaths}
            online={releasesOnline}
            installingTag={busy ? installingTag : undefined}
            onReinstall={reinstallTag}
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
            loading={loading || (releasesOnline && !loadedOnce && !listError)}
            loadingMore={loadingMore}
            hasMore={hasMore}
            error={listError ? t('versions.loadFailed') : error ? t('error.generic') : undefined}
            errorDetails={listError || error || undefined}
            installingTag={busy ? installingTag : undefined}
            onLoadMore={() => void loadPage(page + 1, true)}
            onRetry={() => void loadPage(1, false)}
            onInstall={onInstall}
            onRemove={onRemove}
            onOpen={onOpen}
          />
        )}
      </PageTransition>
    </Stack>
  );
}
