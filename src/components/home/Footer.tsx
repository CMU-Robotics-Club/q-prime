import { Box, Link, Stack } from '@mui/material';

export default function Footer(props: { gitHubLink?: string }) {
  const { gitHubLink } = props;

  return (
    <Box
      component="footer"
      sx={(theme) => ({
        // `mt: auto` inside the parent Container's column-flex layout pushes
        // the footer to the bottom of the viewport on short pages, while still
        // letting it sit at the natural end of the scroll area on long pages.
        mt: 'auto',
        pt: 3,
        pb: 2.5,
        borderTop: `1px solid ${theme.palette.rule.default}`,
      })}
    >
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems="center"
        justifyContent="space-between"
        spacing={1.5}
        sx={{ px: 3 }}
      >
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          alignItems="center"
          spacing={{ xs: 1, sm: 1.5 }}
        >
          <Box
            component="span"
            sx={(theme) => ({
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.75,
              fontFamily: theme.fonts.ui,
              fontWeight: 700,
              fontSize: 14,
              lineHeight: 1,
              color: theme.palette.ink.primary,
              letterSpacing: '-0.02em',
            })}
          >
            {/* The RoboClub mark; same file as the browser favicon. */}
            <Box
              component="img"
              src="/favicon.svg"
              alt=""
              aria-hidden
              sx={{ display: 'block', width: 20, height: 20 }}
            />
            Red Robot Print Queue
          </Box>
          <Box
            component="span"
            sx={(theme) => ({
              fontFamily: theme.fonts.sans,
              fontSize: 12,
              lineHeight: 1,
              color: theme.palette.ink.muted,
              textAlign: 'center',
            })}
          >
            CMU Robotics Club · Based on ohq by CMU 15-122
          </Box>
        </Stack>
        {gitHubLink && (
          <Link
            href={gitHubLink}
            target="_blank"
            rel="noopener noreferrer"
            sx={(theme) => ({
              fontFamily: theme.fonts.mono,
              fontSize: 11,
              lineHeight: 1,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: theme.palette.ink.muted,
              textDecoration: 'none',
              '&:hover': { color: theme.palette.ink.primary, textDecoration: 'underline' },
            })}
          >
            Source on GitHub
          </Link>
        )}
      </Stack>
    </Box>
  );
}
