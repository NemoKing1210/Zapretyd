import { DeleteOutline, StopOutlined } from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import type { InstalledVersion, ServiceStatus, StrategyInfo } from '../../../shared/api/zapretyd';
import { useTranslation } from '../../../shared/i18n';
import type { TranslationKey } from '../../../shared/i18n/locales/en';

export function ServicePage({
  status,
  versions,
  loadStrategies,
  onActivate,
  onStop,
  onRemove,
  onAdmin,
}: {
  status?: ServiceStatus;
  versions: InstalledVersion[];
  loadStrategies: (tag: string) => Promise<StrategyInfo[]>;
  onActivate: (strategy: StrategyInfo) => Promise<void>;
  onStop: () => void;
  onRemove: () => void;
  onAdmin: () => void;
}) {
  const { t } = useTranslation();
  const [version, setVersion] = useState('');
  const [strategies, setStrategies] = useState<StrategyInfo[]>([]);
  const [strategy, setStrategy] = useState('');
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (version) loadStrategies(version).then(setStrategies);
  }, [version, loadStrategies]);
  const picked = strategies.find((item) => item.path === strategy);
  const message = status?.messageCode ? t(status.messageCode as TranslationKey) : '';
  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h3">{t('service.title')}</Typography>
        <Typography color="text.secondary" mt={1}>
          {message}
        </Typography>
      </Box>
      {!status?.isAdmin && (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" size="small" onClick={onAdmin}>
              {t('service.restart')}
            </Button>
          }
        >
          {t('service.adminWarning')}
        </Alert>
      )}
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6">{t('service.assignStrategy')}</Typography>
            <FormControl fullWidth>
              <InputLabel>{t('service.version')}</InputLabel>
              <Select
                label={t('service.version')}
                value={version}
                onChange={(event) => {
                  setVersion(String(event.target.value));
                  setStrategy('');
                }}
              >
                <MenuItem value="">
                  <em>{t('service.selectVersion')}</em>
                </MenuItem>
                {versions.map((item) => (
                  <MenuItem key={item.tag} value={item.tag}>
                    {item.tag}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth disabled={!version}>
              <InputLabel>{t('service.strategy')}</InputLabel>
              <Select
                label={t('service.strategy')}
                value={strategy}
                onChange={(event) => setStrategy(String(event.target.value))}
              >
                {strategies.map((item) => (
                  <MenuItem key={item.path} value={item.path}>
                    {item.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button disabled={!picked || !status?.isAdmin} onClick={() => setConfirm(true)}>
              {t('service.replaceAndStart')}
            </Button>
          </Stack>
        </CardContent>
      </Card>
      <Stack direction="row" spacing={2}>
        <Button
          variant="outlined"
          color="warning"
          startIcon={<StopOutlined />}
          disabled={!status?.serviceRunning || !status.isAdmin}
          onClick={onStop}
        >
          {t('service.stop')}
        </Button>
        <Button
          variant="outlined"
          color="error"
          startIcon={<DeleteOutline />}
          disabled={!status?.serviceExists || !status.isAdmin}
          onClick={onRemove}
        >
          {t('service.removeService')}
        </Button>
      </Stack>
      <Dialog open={confirm} onClose={() => setConfirm(false)}>
        <DialogTitle>{t('service.confirmTitle')}</DialogTitle>
        <DialogContent>{t('service.confirmBody')}</DialogContent>
        <DialogActions>
          <Button variant="text" onClick={() => setConfirm(false)}>
            {t('service.cancel')}
          </Button>
          <Button
            onClick={async () => {
              if (picked) {
                await onActivate(picked);
                setConfirm(false);
              }
            }}
          >
            {t('service.replace')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
