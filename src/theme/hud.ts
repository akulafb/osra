import { CONNECT_ACCENT, relationColor } from '../components/cards/relationStyle';
import type { RelativeDirection } from '../types/graph';
import { livePair } from './paperPair';

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
  relation: Record<RelativeDirection, { line: string; glow: string }>;
  connect: {
    accent: string;
    optionBorder: string;
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
  relation: {
    parent: { line: relationColor('parent'), glow: `${relationColor('parent')}33` },
    spouse: { line: relationColor('spouse'), glow: `${relationColor('spouse')}33` },
    child: { line: relationColor('child'), glow: `${relationColor('child')}33` },
    sibling: { line: relationColor('sibling'), glow: `${relationColor('sibling')}33` },
  },
  connect: {
    accent: CONNECT_ACCENT,
    optionBorder: `${CONNECT_ACCENT}66`,
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

export function paperHud(): HudTokens {
  const { paper, ink, accent } = livePair;
  return {
    error: accent(),
    banner: {
      surface: paper(0.96),
      border: ink(),
      glow: ink(0.15),
      ink: ink(),
      highlight: ink(),
    },
    card: {
      border: ink(0.2),
      controlBorder: ink(0.3),
      field: ink(0.05),
      shadow: ink(0.2),
      inkSecondary: ink(0.8),
      inkQuiet: ink(0.45),
      highlight: ink(),
      onAccent: paper(),
      onRelation: paper(),
      disabledFill: ink(0.1),
    },
    editor: {
      surface: paper(0.96),
      caption: ink(0.65),
      prompt: ink(0.75),
      pill: paper(0.92),
      pillBorder: ink(0.3),
      pillInk: ink(0.85),
    },
    targeting: {
      field: ink(0.06),
      warning: accent(),
      option: ink(0.08),
      optionOffSurface: ink(0.03),
      optionOffBorder: ink(0.08),
      optionOffInk: ink(0.35),
    },
    ghost: {
      surface: paper(0.97),
      matchSurface: paper(),
      matchBorder: ink(0.4),
      matchActive: ink(0.12),
      matchAction: ink(),
      matchInk: ink(),
      matchMeta: ink(0.6),
      matchMore: ink(0.45),
    },
    picker: {
      surface: paper(0.98),
      border: ink(),
      glow: ink(0.15),
      choice: ink(0.04),
      confirm: ink(),
      confirmGlow: ink(0.25),
    },
    relation: {
      parent: { line: ink(), glow: ink(0.2) },
      spouse: { line: ink(0.85), glow: ink(0.2) },
      child: { line: ink(0.7), glow: ink(0.2) },
      sibling: { line: ink(0.6), glow: ink(0.2) },
    },
    connect: {
      accent: accent(),
      optionBorder: accent(0.4),
    },
    kinship: {
      parentSource: ink(),
      parentTarget: ink(0.55),
      marriage: ink(),
      divorce: ink(0.5),
      father: ink(),
      fatherTint: ink(0.12),
      mother: ink(0.6),
      motherTint: ink(0.06),
    },
  };
}
