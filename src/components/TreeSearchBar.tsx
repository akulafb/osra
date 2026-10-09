import React, { useRef, useEffect, useCallback } from 'react';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import type { FamilyNode } from '../types/graph';

interface TreeSearchBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  matches: FamilyNode[];
  currentIndex: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  disabled?: boolean;
  placeholder?: string;
  /** When true, render inline in a panel (no absolute positioning) */
  embedded?: boolean;
  /** Increment to trigger focus on the input (e.g. when Ctrl+F opens search) */
  focusTrigger?: number;
  /** A match count shown under the bar in the embedded panel, e.g. "4 PEOPLE". */
  countLabel?: string;
}

export function TreeSearchBar({
  query,
  onQueryChange,
  matches,
  currentIndex,
  onPrev,
  onNext,
  onClose,
  disabled = false,
  placeholder = 'Search names (Ar/En)...',
  embedded = false,
  focusTrigger = 0,
  countLabel,
}: TreeSearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { panel } = useTheme().palette;

  useEffect(() => {
    if (focusTrigger > 0 && inputRef.current) {
      inputRef.current.focus();
    }
  }, [focusTrigger]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
          onPrev();
        } else {
          onNext();
        }
      }
    },
    [onClose, onPrev, onNext]
  );

  const hasMatches = matches.length > 0;
  const canNavigate = hasMatches;

  const textFieldSx = {
    width: '100%',
    '& .MuiOutlinedInput-root': {
      backgroundColor: panel.surface.inset,
      color: panel.ink.strong,
      fontFamily: '"Inter", sans-serif',
      letterSpacing: '0.02em',
      '& fieldset': { borderColor: panel.border.field },
      '&:hover fieldset': { borderColor: panel.border.fieldHover },
      '&.Mui-focused fieldset': { borderColor: panel.border.fieldFocus },
    },
  };

  const controlsRow = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 1 }}>
      <Typography 
        variant="caption" 
        sx={{ 
          color: panel.role.primary,
          minWidth: 45, 
          fontFamily: 'monospace',
          fontWeight: 600,
          textAlign: 'center',
          background: panel.tint.accent,
          px: 1,
          py: 0.5,
          borderRadius: '4px'
        }}
      >
        {hasMatches ? `${currentIndex + 1}/${matches.length}` : '0/0'}
      </Typography>
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        <IconButton
          size="small"
          onClick={onPrev}
          disabled={!canNavigate}
          aria-label="Previous match"
          sx={{ 
            color: panel.ink.strong,
            background: panel.surface.control,
            '&:hover': { background: panel.surface.controlHover },
            '&.Mui-disabled': { color: panel.ink.disabled }
          }}
        >
          ‹
        </IconButton>
        <IconButton
          size="small"
          onClick={onNext}
          disabled={!canNavigate}
          aria-label="Next match"
          sx={{ 
            color: panel.ink.strong,
            background: panel.surface.control,
            '&:hover': { background: panel.surface.controlHover },
            '&.Mui-disabled': { color: panel.ink.disabled }
          }}
        >
          ›
        </IconButton>
      </Box>
    </Box>
  );

  if (embedded) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, width: '100%' }}>
        <TextField
          inputRef={inputRef}
          size="small"
          variant="outlined"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? 'Select a family to search' : placeholder}
          disabled={disabled}
          slotProps={{
            htmlInput: {
              dir: 'auto',
              'aria-label': 'Search family tree',
            }
          }}
          sx={textFieldSx}
        />
        {controlsRow}
        {countLabel !== undefined && (
          <Typography
            variant="caption"
            role="status"
            sx={{ color: panel.role.primary, fontWeight: 700, letterSpacing: '0.1em', fontSize: '0.6rem', ml: 1 }}
          >
            {countLabel}
          </Typography>
        )}
      </Box>
    );
  }

  const containerSx = {
    position: 'absolute' as const,
    top: 24,
    left: 24,
    zIndex: 1000,
    p: '6px 12px',
    display: 'flex',
    alignItems: 'center',
    gap: 1,
    backgroundColor: panel.surface.toggle,
    backdropFilter: 'blur(24px)',
    border: `1px solid ${panel.border.accent}`,
    borderRadius: '8px',
    boxShadow: `0 8px 32px ${panel.shadow.soft}`,
  };

  return (
    <Box sx={containerSx}>
      <TextField
        inputRef={inputRef}
        size="small"
        variant="outlined"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={disabled ? 'Select a family to search' : placeholder}
        disabled={disabled}
        slotProps={{
          htmlInput: {
            dir: 'auto',
            'aria-label': 'Search family tree',
          }
        }}
        sx={{ flex: 1, minWidth: 220, ...textFieldSx }}
      />
      {controlsRow}
    </Box>
  );
}
