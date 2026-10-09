import type React from 'react';
import type { Theme } from '@mui/material/styles';

const modalOverlayStyle = ({ palette }: Theme): React.CSSProperties => ({
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: palette.modal.scrim,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 2000,
  backdropFilter: 'blur(8px)',
});

export function addRelativeOverlayStyle(
  theme: Theme,
  { previewConnect, previewNarrow }: { previewConnect: boolean; previewNarrow: boolean }
): React.CSSProperties {
  if (!previewConnect) return modalOverlayStyle(theme);
  return {
    ...modalOverlayStyle(theme),
    backgroundColor: 'transparent',
    backdropFilter: 'none',
    pointerEvents: 'none',
    justifyContent: 'flex-end',
    alignItems: previewNarrow ? 'stretch' : 'center',
    flexDirection: previewNarrow ? 'column' : 'row',
  };
}
