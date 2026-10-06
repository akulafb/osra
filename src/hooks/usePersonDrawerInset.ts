import type { CSSProperties } from 'react';
import { useMediaQuery, useTheme } from '@mui/material';

export const SIDE_DRAWER_WIDTH_PX = 400;
export const SHEET_MAX_HEIGHT_VH = 45;

// A right-hand drawer is most of the screen on a phone or a narrow tablet, and
// leaves no room for the controls docked beside it. There it is a bottom sheet
// instead, so the Tree Node it describes stays in view.
export function useIsDrawerSheet(): boolean {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down('md'));
}

export interface PersonDrawerInset {
  rightPx: number;
  bottomVh: number;
}

const NO_DRAWER_INSET: PersonDrawerInset = { rightPx: 0, bottomVh: 0 };

export function usePersonDrawerInset(open: boolean): PersonDrawerInset {
  const isSheet = useIsDrawerSheet();
  if (!open) return NO_DRAWER_INSET;
  return isSheet
    ? { rightPx: 0, bottomVh: SHEET_MAX_HEIGHT_VH }
    : { rightPx: SIDE_DRAWER_WIDTH_PX, bottomVh: 0 };
}

export function topRightControlsClear(inset: PersonDrawerInset): CSSProperties {
  return {
    top: 24,
    right: 24 + inset.rightPx,
    ...(inset.bottomVh > 0 && {
      maxHeight: `calc(100% - 48px - ${inset.bottomVh}vh)`,
      overflowY: 'auto',
    }),
  };
}

export function bottomRightControlsClear(inset: PersonDrawerInset): CSSProperties {
  return {
    bottom: `calc(20px + ${inset.bottomVh}vh)`,
    right: 20 + inset.rightPx,
  };
}
