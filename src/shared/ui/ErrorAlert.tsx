import { ExpandMore } from '@mui/icons-material';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Typography,
  type AlertProps,
} from '@mui/material';
import type { ReactNode } from 'react';
import { useTranslation } from '../i18n';

export function ErrorAlert({
  message,
  details,
  severity = 'error',
  action,
}: {
  message: string;
  /** Technical / raw error — shown only in development inside an expandable block. */
  details?: string;
  severity?: AlertProps['severity'];
  action?: ReactNode;
}) {
  const { t, translateError } = useTranslation();
  const detailText = details?.trim() ? translateError(details) : '';
  const showDetails = import.meta.env.DEV && Boolean(detailText);

  return (
    <Alert severity={severity} action={action} sx={{ alignItems: 'flex-start' }}>
      <Box>
        {message}
        {showDetails && (
          <Accordion
            disableGutters
            elevation={0}
            sx={{
              bgcolor: 'transparent',
              mt: 1,
              '&:before': { display: 'none' },
            }}
          >
            <AccordionSummary
              expandIcon={<ExpandMore />}
              sx={{ minHeight: 36, px: 0, '& .MuiAccordionSummary-content': { my: 0.5 } }}
            >
              <Typography variant="body2" fontWeight={600}>
                {t('error.details')}
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 0, pt: 0 }}>
              <Typography
                component="pre"
                variant="caption"
                sx={{
                  m: 0,
                  p: 1.5,
                  borderRadius: 1,
                  bgcolor: 'action.hover',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontFamily: 'ui-monospace, Consolas, monospace',
                }}
              >
                {detailText}
              </Typography>
            </AccordionDetails>
          </Accordion>
        )}
      </Box>
    </Alert>
  );
}
