import { Box, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
import { useCanvasMode } from '../hooks/useCanvasMode';
import type { CanvasMode } from '../lib/canvasMode';

export function CanvasModeSwitch() {
  const { mode, setMode, paperColour, setPaperColour } = useCanvasMode();
  const { panel } = useTheme().palette;
  const colourOn = paperColour === 'colour';

  const buttonSx = {
    fontSize: '0.7rem',
    fontWeight: 700,
    letterSpacing: '0.05em',
    color: panel.ink.faint,
    borderColor: panel.border.subtle,
    py: 0.5,
    '&.Mui-selected': {
      color: panel.role.primary,
      backgroundColor: panel.tint.accent,
    },
  };

  return (
    <Box>
      <Typography variant="caption" sx={{ color: panel.role.primary, fontWeight: 700, letterSpacing: '0.1em', mb: 1, display: 'block', fontSize: '0.6rem' }}>
        CANVAS MODE
      </Typography>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <ToggleButtonGroup
          value={mode}
          exclusive
          fullWidth
          size="small"
          aria-label="Canvas Mode"
          onChange={(_, next: CanvasMode | null) => next && setMode(next)}
          sx={{ backgroundColor: panel.surface.well, '& .MuiToggleButton-root': buttonSx }}
        >
          <ToggleButton value="cosmos">COSMOS</ToggleButton>
          <ToggleButton value="paper">PAPER</ToggleButton>
        </ToggleButtonGroup>
        {mode === 'paper' && (
          <ToggleButton
            value="colour"
            size="small"
            selected={colourOn}
            onChange={() => setPaperColour(colourOn ? 'grayscale' : 'colour')}
            aria-label="Paper colour"
            title={colourOn ? 'Back to grayscale' : 'Colour Paper by family'}
            sx={{ ...buttonSx, px: 1, backgroundColor: panel.surface.well }}
          >
            <PaletteOutlinedIcon sx={{ fontSize: '1rem' }} />
          </ToggleButton>
        )}
      </Box>
    </Box>
  );
}
