import { alpha } from '@mui/material/styles';
import { PAPER_ACCENT, type PaperPair } from './paperPair';

export interface HudTokens {
  error: string;
  banner: {
    surface: string;
    border: string;
    glow: string;
    ink: string;
    highlight: string;
  };
  card: {
    border: string;
    controlBorder: string;
    field: string;
    shadow: string;
    inkSecondary: string;
    inkQuiet: string;
    highlight: string;
    onAccent: string;
    onRelation: string;
    disabledFill: string;
  };
  editor: {
    surface: string;
    caption: string;
    prompt: string;
    pill: string;
    pillBorder: string;
    pillInk: string;
  };
  targeting: {
    field: string;
    warning: string;
    option: string;
    optionOffSurface: string;
    optionOffBorder: string;
    optionOffInk: string;
  };
  ghost: {
    surface: string;
    matchSurface: string;
    matchBorder: string;
    matchActive: string;
    matchAction: string;
    matchInk: string;
    matchMeta: string;
    matchMore: string;
  };
  picker: {
    surface: string;
    border: string;
    glow: string;
    choice: string;
    confirm: string;
    confirmGlow: string;
  };
  kinship: {
    parentSource: string;
    parentTarget: string;
    marriage: string;
    divorce: string;
    father: string;
    fatherTint: string;
    mother: string;
    motherTint: string;
  };
}

declare module '@mui/material/styles' {
  interface Palette {
    hud: HudTokens;
  }
  interface PaletteOptions {
    hud?: HudTokens;
  }
}

export const cosmosHud: HudTokens = {
  error: '#f87171',
  banner: {
    surface: 'rgba(15, 23, 42, 0.95)',
    border: 'rgba(168, 85, 247, 0.8)',
    glow: 'rgba(168, 85, 247, 0.4)',
    ink: '#e2e8f0',
    highlight: '#c084fc',
  },
  card: {
    border: 'rgba(255,255,255,0.15)',
    controlBorder: 'rgba(255,255,255,0.2)',
    field: 'rgba(30, 41, 59, 0.9)',
    shadow: 'rgba(0,0,0,0.7)',
    inkSecondary: 'rgba(255,255,255,0.8)',
    inkQuiet: 'rgba(255,255,255,0.4)',
    highlight: '#c084fc',
    onAccent: '#0f172a',
    onRelation: '#0f172a',
    disabledFill: 'rgba(255,255,255,0.1)',
  },
  editor: {
    surface: 'rgba(15, 23, 42, 0.95)',
    caption: 'rgba(255,255,255,0.65)',
    prompt: 'rgba(255,255,255,0.75)',
    pill: 'rgba(15, 23, 42, 0.92)',
    pillBorder: 'rgba(255,255,255,0.3)',
    pillInk: 'rgba(255,255,255,0.85)',
  },
  targeting: {
    field: 'rgba(0,0,0,0.35)',
    warning: '#fbbf24',
    option: 'rgba(192, 132, 252, 0.12)',
    optionOffSurface: 'rgba(255,255,255,0.03)',
    optionOffBorder: 'rgba(255,255,255,0.08)',
    optionOffInk: 'rgba(255,255,255,0.35)',
  },
  ghost: {
    surface: 'rgba(15, 23, 42, 0.96)',
    matchSurface: 'rgba(10, 15, 30, 0.98)',
    matchBorder: 'rgba(168, 85, 247, 0.5)',
    matchActive: 'rgba(168, 85, 247, 0.25)',
    matchAction: '#e9d5ff',
    matchInk: '#e2e8f0',
    matchMeta: '#94a3b8',
    matchMore: '#64748b',
  },
  picker: {
    surface: 'rgba(15, 23, 42, 0.98)',
    border: 'rgba(168, 85, 247, 0.8)',
    glow: 'rgba(168, 85, 247, 0.35)',
    choice: 'rgba(255,255,255,0.04)',
    confirm: '#a855f7',
    confirmGlow: 'rgba(168, 85, 247, 0.5)',
  },
  kinship: {
    parentSource: '#38bdf8',
    parentTarget: '#fef08a',
    marriage: '#f472b6',
    divorce: '#94a3b8',
    father: '#38bdf8',
    fatherTint: 'rgba(56, 189, 248, 0.25)',
    mother: '#f472b6',
    motherTint: 'rgba(244, 114, 182, 0.25)',
  },
};

export function paperHud({ paper, ink }: PaperPair): HudTokens {
  return {
    error: PAPER_ACCENT,
    banner: {
      surface: alpha(paper, 0.96),
      border: ink,
      glow: alpha(ink, 0.15),
      ink,
      highlight: ink,
    },
    card: {
      border: alpha(ink, 0.2),
      controlBorder: alpha(ink, 0.3),
      field: alpha(ink, 0.05),
      shadow: alpha(ink, 0.2),
      inkSecondary: alpha(ink, 0.8),
      inkQuiet: alpha(ink, 0.45),
      highlight: ink,
      onAccent: paper,
      onRelation: '#0f172a',
      disabledFill: alpha(ink, 0.1),
    },
    editor: {
      surface: alpha(paper, 0.96),
      caption: alpha(ink, 0.65),
      prompt: alpha(ink, 0.75),
      pill: alpha(paper, 0.92),
      pillBorder: alpha(ink, 0.3),
      pillInk: alpha(ink, 0.85),
    },
    targeting: {
      field: alpha(ink, 0.06),
      warning: PAPER_ACCENT,
      option: alpha(ink, 0.08),
      optionOffSurface: alpha(ink, 0.03),
      optionOffBorder: alpha(ink, 0.08),
      optionOffInk: alpha(ink, 0.35),
    },
    ghost: {
      surface: alpha(paper, 0.97),
      matchSurface: paper,
      matchBorder: alpha(ink, 0.4),
      matchActive: alpha(ink, 0.12),
      matchAction: ink,
      matchInk: ink,
      matchMeta: alpha(ink, 0.6),
      matchMore: alpha(ink, 0.45),
    },
    picker: {
      surface: alpha(paper, 0.98),
      border: ink,
      glow: alpha(ink, 0.15),
      choice: alpha(ink, 0.04),
      confirm: ink,
      confirmGlow: alpha(ink, 0.25),
    },
    kinship: {
      parentSource: ink,
      parentTarget: alpha(ink, 0.55),
      marriage: ink,
      divorce: alpha(ink, 0.5),
      father: ink,
      fatherTint: alpha(ink, 0.12),
      mother: alpha(ink, 0.6),
      motherTint: alpha(ink, 0.06),
    },
  };
}
