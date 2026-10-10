import type { MutableRefObject } from 'react';
import Box from '@mui/material/Box';
import Slider from '@mui/material/Slider';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { SPREAD_MAX, SPREAD_MIN, toSpread, type Spread } from '../../lib/paperSpread';

const SPREAD_STEP = 0.001;

const spreadText = (value: number) => `${value.toFixed(1)}x`;

/**
 * SPREAD in INSTRUMENTS. The slider keeps its own thumb and writes each tick
 * straight into `spread`, which the scene reads once a frame, so dragging it
 * re-renders nothing but the slider.
 */
export function PaperSpreadSlider({ spread }: { spread: MutableRefObject<Spread> }) {
  const { panel } = useTheme().palette;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pr: 1 }}>
      <Typography
        component="span"
        sx={{ color: panel.role.text, fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.05em', flexShrink: 0 }}
      >
        SPREAD
      </Typography>
      <Slider
        size="small"
        aria-label="Spread"
        defaultValue={spread.current}
        min={SPREAD_MIN}
        max={SPREAD_MAX}
        step={SPREAD_STEP}
        getAriaValueText={spreadText}
        onChange={(_, value) => {
          spread.current = toSpread(Array.isArray(value) ? value[0] : value);
        }}
      />
    </Box>
  );
}
