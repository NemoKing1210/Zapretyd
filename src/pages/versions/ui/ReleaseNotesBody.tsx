import { Link, Typography } from '@mui/material';
import Markdown from 'react-markdown';
import type { Components } from 'react-markdown';
import { api } from '../../../shared/api/zapretyd';
import { useTranslation } from '../../../shared/i18n';

const markdownComponents: Components = {
  a: ({ href, children }) => (
    <Link
      component="button"
      type="button"
      variant="body2"
      onClick={() => {
        if (href) void api.openUrl(href);
      }}
      sx={{ verticalAlign: 'baseline', cursor: 'pointer', textAlign: 'left' }}
    >
      {children}
    </Link>
  ),
  p: ({ children }) => (
    <Typography variant="body2" paragraph sx={{ '&:last-child': { mb: 0 } }}>
      {children}
    </Typography>
  ),
  h1: ({ children }) => (
    <Typography variant="h6" gutterBottom>
      {children}
    </Typography>
  ),
  h2: ({ children }) => (
    <Typography variant="subtitle1" fontWeight={700} gutterBottom>
      {children}
    </Typography>
  ),
  h3: ({ children }) => (
    <Typography variant="subtitle2" fontWeight={700} gutterBottom>
      {children}
    </Typography>
  ),
  ul: ({ children }) => (
    <Typography component="ul" variant="body2" sx={{ pl: 2.5, my: 1 }}>
      {children}
    </Typography>
  ),
  ol: ({ children }) => (
    <Typography component="ol" variant="body2" sx={{ pl: 2.5, my: 1 }}>
      {children}
    </Typography>
  ),
  li: ({ children }) => (
    <Typography component="li" variant="body2" sx={{ my: 0.5 }}>
      {children}
    </Typography>
  ),
  code: ({ children }) => (
    <Typography
      component="code"
      variant="body2"
      sx={{
        fontFamily: 'ui-monospace, Consolas, monospace',
        bgcolor: 'action.hover',
        px: 0.5,
        borderRadius: 0.5,
      }}
    >
      {children}
    </Typography>
  ),
};

export function ReleaseNotesBody({
  body,
  htmlUrl,
}: {
  body?: string;
  htmlUrl?: string;
}) {
  const { t } = useTranslation();
  const text = body?.trim();
  return (
    <>
      {text ? (
        <Markdown components={markdownComponents}>{text}</Markdown>
      ) : (
        <Typography color="text.secondary" variant="body2">
          {t('versions.notesEmpty')}
        </Typography>
      )}
      {htmlUrl && (
        <Typography variant="body2" mt={1.5}>
          <Link
            component="button"
            type="button"
            variant="body2"
            onClick={() => void api.openUrl(htmlUrl)}
            sx={{ cursor: 'pointer' }}
          >
            {t('versions.openOnGitHub')}
          </Link>
        </Typography>
      )}
    </>
  );
}
