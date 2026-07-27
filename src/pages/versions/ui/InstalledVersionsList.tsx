import { useRef, useState } from 'react';
import { DeleteOutline, ExpandMore, RefreshOutlined } from '@mui/icons-material';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  Stack,
  Typography,
} from '@mui/material';
import {
  api,
  type InstalledVersion,
  type ListFileInfo,
  type StrategyInfo,
} from '../../../shared/api/zapretyd';
import { useTranslation } from '../../../shared/i18n';
import { formatBytes, formatDate, formatVersionPath } from '../../../shared/lib/format';
import { VersionListsPanel } from './VersionListsPanel';
import { VersionStrategiesPanel } from './VersionStrategiesPanel';

type ConfirmAction = { type: 'reinstall'; tag: string } | { type: 'remove'; tag: string };

type ListsPayload = {
  tag: string;
  files: ListFileInfo[];
  error: string | null;
};

type StrategiesPayload = {
  tag: string;
  items: StrategyInfo[];
  error: string | null;
};

const accordionSx = {
  bgcolor: 'transparent',
  '&:before': { display: 'none' },
  borderTop: 1,
  borderColor: 'divider',
} as const;

export function InstalledVersionsList({
  versions,
  latestTag,
  libraryPath,
  shortenPaths = false,
  online = true,
  installingTag,
  isAdmin = false,
  activeStrategy,
  activateBusy = false,
  onActivate,
  onReinstall,
  onRemove,
  onOpen,
  onBrowseAll,
}: {
  versions: InstalledVersion[];
  latestTag?: string;
  libraryPath?: string;
  shortenPaths?: boolean;
  online?: boolean;
  installingTag?: string;
  isAdmin?: boolean;
  activeStrategy?: string;
  activateBusy?: boolean;
  onActivate?: (strategy: StrategyInfo) => void | Promise<void>;
  onReinstall: (tag: string) => void | Promise<void>;
  onRemove: (tag: string) => void | Promise<void>;
  onOpen: (path: string) => void;
  onBrowseAll: () => void;
}) {
  const { t, translateError } = useTranslation();
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const [expandedListsTag, setExpandedListsTag] = useState<string | false>(false);
  const [scanningListsTag, setScanningListsTag] = useState<string | null>(null);
  const [listsPayload, setListsPayload] = useState<ListsPayload | null>(null);
  const listsRequestId = useRef(0);

  const [expandedStrategiesTag, setExpandedStrategiesTag] = useState<string | false>(false);
  const [scanningStrategiesTag, setScanningStrategiesTag] = useState<string | null>(null);
  const [strategiesPayload, setStrategiesPayload] = useState<StrategiesPayload | null>(null);
  const strategiesRequestId = useRef(0);

  const busy = Boolean(installingTag) || confirmBusy;

  const openConfirm = (action: ConfirmAction) => {
    setConfirm(action);
    setConfirmOpen(true);
  };
  const closeConfirm = () => {
    if (confirmBusy) return;
    setConfirmOpen(false);
  };

  const collapseLists = () => {
    listsRequestId.current += 1;
    setScanningListsTag(null);
    setExpandedListsTag(false);
    setListsPayload(null);
  };

  const collapseStrategies = () => {
    strategiesRequestId.current += 1;
    setScanningStrategiesTag(null);
    setExpandedStrategiesTag(false);
    setStrategiesPayload(null);
  };

  const handleListsToggle = (tag: string, open: boolean) => {
    if (!open) {
      collapseLists();
      return;
    }
    if (scanningListsTag === tag) return;

    const requestId = ++listsRequestId.current;
    setExpandedListsTag(false);
    setListsPayload(null);
    setScanningListsTag(tag);

    void api
      .listVersionListFiles(tag)
      .then((files) => {
        if (requestId !== listsRequestId.current) return;
        setListsPayload({ tag, files, error: null });
        setExpandedListsTag(tag);
      })
      .catch((cause) => {
        if (requestId !== listsRequestId.current) return;
        setListsPayload({ tag, files: [], error: translateError(String(cause)) });
        setExpandedListsTag(tag);
      })
      .finally(() => {
        if (requestId === listsRequestId.current) {
          setScanningListsTag(null);
        }
      });
  };

  const handleStrategiesToggle = (tag: string, open: boolean) => {
    if (!open) {
      collapseStrategies();
      return;
    }
    if (scanningStrategiesTag === tag) return;

    const requestId = ++strategiesRequestId.current;
    setExpandedStrategiesTag(false);
    setStrategiesPayload(null);
    setScanningStrategiesTag(tag);

    void api
      .strategies(tag)
      .then((items) => {
        if (requestId !== strategiesRequestId.current) return;
        setStrategiesPayload({ tag, items, error: null });
        setExpandedStrategiesTag(tag);
      })
      .catch((cause) => {
        if (requestId !== strategiesRequestId.current) return;
        setStrategiesPayload({ tag, items: [], error: translateError(String(cause)) });
        setExpandedStrategiesTag(tag);
      })
      .finally(() => {
        if (requestId === strategiesRequestId.current) {
          setScanningStrategiesTag(null);
        }
      });
  };

  if (versions.length === 0) {
    return (
      <Alert
        severity="info"
        action={
          <Button color="inherit" size="small" onClick={onBrowseAll}>
            {t('versions.tabAll')}
          </Button>
        }
      >
        {t('versions.noVersions')}
      </Alert>
    );
  }

  return (
    <Stack spacing={2}>
      {versions.map((version) => {
        const installing = installingTag === version.tag;
        const scanningLists = scanningListsTag === version.tag;
        const scanningStrategies = scanningStrategiesTag === version.tag;
        const listsExpanded = expandedListsTag === version.tag;
        const strategiesExpanded = expandedStrategiesTag === version.tag;
        return (
          <Card key={version.tag}>
            <CardContent>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                justifyContent="space-between"
                gap={2}
                alignItems={{ sm: 'flex-start' }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography variant="h6">{version.tag}</Typography>
                    {latestTag && version.tag === latestTag && (
                      <Chip label={t('versions.latest')} color="primary" size="small" />
                    )}
                    {version.isActive && (
                      <Chip label={t('versions.active')} color="secondary" size="small" />
                    )}
                  </Stack>
                  <Typography color="text.secondary" variant="body2">
                    {t('versions.installed', {
                      date: formatDate(version.installedAt),
                      size: formatBytes(version.size),
                    })}
                  </Typography>
                  <Link
                    component="button"
                    type="button"
                    variant="caption"
                    onClick={() => onOpen(version.path)}
                    sx={{
                      display: 'block',
                      mt: 0.75,
                      maxWidth: '100%',
                      textAlign: 'left',
                      wordBreak: 'break-all',
                      cursor: 'pointer',
                      color: 'primary.main',
                    }}
                  >
                    {formatVersionPath(version.path, libraryPath, shortenPaths)}
                  </Link>
                </Box>
                <Stack direction="row" spacing={1} flexShrink={0} flexWrap="wrap" useFlexGap>
                  <Button
                    color="warning"
                    startIcon={
                      installing ? (
                        <CircularProgress size={18} color="inherit" />
                      ) : (
                        <RefreshOutlined />
                      )
                    }
                    disabled={busy || version.isActive || !online}
                    onClick={() => openConfirm({ type: 'reinstall', tag: version.tag })}
                  >
                    {t('versions.reinstall')}
                  </Button>
                  <Button
                    color="error"
                    startIcon={<DeleteOutline />}
                    disabled={busy || version.isActive}
                    onClick={() => openConfirm({ type: 'remove', tag: version.tag })}
                  >
                    {t('versions.remove')}
                  </Button>
                </Stack>
              </Stack>
            </CardContent>
            <Accordion
              disableGutters
              elevation={0}
              expanded={strategiesExpanded}
              onChange={(_, open) => handleStrategiesToggle(version.tag, open)}
              sx={accordionSx}
            >
              <AccordionSummary
                expandIcon={
                  scanningStrategies ? (
                    <CircularProgress size={18} color="inherit" />
                  ) : (
                    <ExpandMore />
                  )
                }
                sx={{
                  opacity: scanningStrategiesTag && !scanningStrategies ? 0.55 : 1,
                  pointerEvents: scanningStrategiesTag && !scanningStrategies ? 'none' : 'auto',
                }}
              >
                <Typography variant="body2">{t('versions.strategies')}</Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0 }}>
                {strategiesExpanded && strategiesPayload?.tag === version.tag ? (
                  <VersionStrategiesPanel
                    items={strategiesPayload.items}
                    error={strategiesPayload.error}
                    isAdmin={isAdmin}
                    versionIsActive={version.isActive}
                    activeStrategy={activeStrategy}
                    activateBusy={activateBusy}
                    onActivate={onActivate}
                  />
                ) : null}
              </AccordionDetails>
            </Accordion>
            <Accordion
              disableGutters
              elevation={0}
              expanded={listsExpanded}
              onChange={(_, open) => handleListsToggle(version.tag, open)}
              sx={accordionSx}
            >
              <AccordionSummary
                expandIcon={
                  scanningLists ? <CircularProgress size={18} color="inherit" /> : <ExpandMore />
                }
                sx={{
                  opacity: scanningListsTag && !scanningLists ? 0.55 : 1,
                  pointerEvents: scanningListsTag && !scanningLists ? 'none' : 'auto',
                }}
              >
                <Typography variant="body2">{t('versions.lists')}</Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0 }}>
                {listsExpanded && listsPayload?.tag === version.tag ? (
                  <VersionListsPanel
                    tag={version.tag}
                    files={listsPayload.files}
                    error={listsPayload.error}
                    onFilesChange={(files) =>
                      setListsPayload((prev) =>
                        prev?.tag === version.tag ? { ...prev, files, error: null } : prev,
                      )
                    }
                  />
                ) : null}
              </AccordionDetails>
            </Accordion>
          </Card>
        );
      })}
      <Dialog
        open={confirmOpen}
        onClose={closeConfirm}
        slotProps={{
          transition: {
            onExited: () => setConfirm(null),
          },
        }}
      >
        <DialogTitle>
          {confirm?.type === 'reinstall'
            ? t('versions.reinstallConfirmTitle', { tag: confirm.tag })
            : t('versions.removeConfirmTitle', { tag: confirm?.tag ?? '' })}
        </DialogTitle>
        <DialogContent>
          {confirm?.type === 'reinstall'
            ? t('versions.reinstallConfirmBody')
            : t('versions.removeConfirmBody')}
        </DialogContent>
        <DialogActions>
          <Button variant="text" disabled={confirmBusy} onClick={closeConfirm}>
            {t('versions.cancel')}
          </Button>
          <Button
            color={confirm?.type === 'reinstall' ? 'warning' : 'error'}
            disabled={confirmBusy || !confirm}
            startIcon={confirmBusy ? <CircularProgress size={18} color="inherit" /> : undefined}
            onClick={async () => {
              if (!confirm) return;
              setConfirmBusy(true);
              try {
                if (confirm.type === 'reinstall') {
                  await onReinstall(confirm.tag);
                } else {
                  await onRemove(confirm.tag);
                }
                setConfirmOpen(false);
              } finally {
                setConfirmBusy(false);
              }
            }}
          >
            {confirm?.type === 'reinstall' ? t('versions.reinstall') : t('versions.remove')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
