import { useMediaQuery, useTheme } from '@mui/material';

export const SIDE_DRAWER_WIDTH_PX = 400;
export const SHEET_MAX_HEIGHT_VH = 45;

// A right-hand drawer at full width is the whole screen on a phone. There it
// is a bottom sheet instead, so the Tree Node it describes stays in view.
export function useIsDrawerSheet(): boolean {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down('sm'));
}

export interface PersonDrawerInset {
  rightPx: number;
  bottomVh: number;
}

export const NO_DRAWER_INSET: PersonDrawerInset = { rightPx: 0, bottomVh: 0 };

export function usePersonDrawerInset(open: boolean): PersonDrawerInset {
  const isSheet = useIsDrawerSheet();
  if (!open) return NO_DRAWER_INSET;
  return isSheet
    ? { rightPx: 0, bottomVh: SHEET_MAX_HEIGHT_VH }
    : { rightPx: SIDE_DRAWER_WIDTH_PX, bottomVh: 0 };
}
