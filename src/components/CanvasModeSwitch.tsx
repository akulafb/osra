import { Box, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useCanvasMode } from '../hooks/useCanvasMode';
import type { CanvasMode } from '../lib/canvasMode';

export function CanvasModeSwitch() {
  const { mode, setMode } = useCanvasMode();
  const { panel } = useTheme().palette;

  return (
    <Box>
      <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 700, letterSpacing: '0.1em', mb: 1, display: 'block', fontSize: '0.6rem' }}>
        CANVAS MODE
      </Typography>
      <ToggleButtonGroup
        value={mode}
        exclusive
        fullWidth
        size="small"
        aria-label="Canvas Mode"
        onChange={(_, next: CanvasMode | null) => next && setMode(next)}
        sx={{
          backgroundColor: panel.surface.well,
          '& .MuiToggleButton-root': {
            fontSize: '0.7rem',
            fontWeight: 700,
            letterSpacing: '0.05em',
            color: panel.ink.faint,
            borderColor: panel.border.subtle,
            py: 0.5,
          },
          '& .MuiToggleButton-root.Mui-selected': {
            color: 'primary.main',
            backgroundColor: panel.tint.accent,
          },
        }}
      >
        <ToggleButton value="cosmos">COSMOS</ToggleButton>
        <ToggleButton value="paper">PAPER</ToggleButton>
      </ToggleButtonGroup>
    </Box>
  );
}
