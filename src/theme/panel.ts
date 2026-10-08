import { alpha } from '@mui/material/styles';
import { PAPER_ACCENT, type PaperPair } from './paperPair';

export interface PanelTokens {
  page: string;
  surface: {
    panel: string;
    drawer: string;
    menu: string;
    toggle: string;
    toggleHover: string;
    pill: string;
    inset: string;
    well: string;
    control: string;
    controlHover: string;
  };
  border: {
    accent: string;
    accentHover: string;
    hairline: string;
    subtle: string;
    subtleHover: string;
    field: string;
    fieldHover: string;
    fieldFocus: string;
  };
  tint: {
    accent: string;
    secondary: string;
  };
  ink: {
    inherited: string;
    strong: string;
    soft: string;
    body: string;
    muted: string;
    faint: string;
    ghost: string;
    disabled: string;
    onAccent: string;
  };
  shadow: {
    raised: string;
    floating: string;
    soft: string;
  };
  fill: {
    findMe: string;
    accent: string;
    accentHover: string;
  };
  nav: {
    surface: string;
    ink: string;
    keyOn: string;
    keyOff: string;
  };
  loader: {
    scrim: string;
    toast: string;
    track: string;
    spinner: string;
    pageSpinner: string;
  };
  zoomBadge: {
    surface: string;
    ink: string;
  };
  attention: {
    glow: string;
    glowPeak: string;
  };
}

declare module '@mui/material/styles' {
  interface Palette {
    panel: PanelTokens;
  }
  interface PaletteOptions {
    panel?: PanelTokens;
  }
}

export const cosmosPanel: PanelTokens = {
  page: '#0a0a0a',
  surface: {
    panel: 'rgba(5, 5, 5, 0.8)',
    drawer: 'rgba(5, 5, 5, 0.75)',
    menu: 'rgba(5, 5, 5, 0.9)',
    toggle: 'rgba(5, 5, 5, 0.7)',
    toggleHover: 'rgba(5, 5, 5, 0.85)',
    pill: 'rgba(5, 5, 5, 0.5)',
    inset: 'rgba(0, 0, 0, 0.3)',
    well: 'rgba(255,255,255,0.03)',
    control: 'rgba(255,255,255,0.05)',
    controlHover: 'rgba(255,255,255,0.1)',
  },
  border: {
    accent: 'rgba(212, 175, 55, 0.2)',
    accentHover: 'rgba(212, 175, 55, 0.4)',
    hairline: 'rgba(255,255,255,0.05)',
    subtle: 'rgba(255,255,255,0.1)',
    subtleHover: 'rgba(255,255,255,0.2)',
    field: 'rgba(212, 175, 55, 0.1)',
    fieldHover: 'rgba(212, 175, 55, 0.3)',
    fieldFocus: 'rgba(212, 175, 55, 0.5)',
  },
  tint: {
    accent: 'rgba(212, 175, 55, 0.1)',
    secondary: 'rgba(124, 58, 237, 0.1)',
  },
  ink: {
    inherited: 'rgba(255, 255, 255, 0.87)',
    strong: '#fff',
    soft: 'rgba(255,255,255,0.9)',
    body: 'rgba(255,255,255,0.7)',
    muted: 'rgba(255,255,255,0.6)',
    faint: 'rgba(255,255,255,0.5)',
    ghost: 'rgba(255,255,255,0.3)',
    disabled: 'rgba(255,255,255,0.2)',
    onAccent: 'black',
  },
  shadow: {
    raised: 'rgba(0,0,0,0.6)',
    floating: 'rgba(0,0,0,0.5)',
    soft: 'rgba(0,0,0,0.4)',
  },
  fill: {
    findMe: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    accent: 'linear-gradient(135deg, #D4AF37 0%, #B8860B 100%)',
    accentHover: 'linear-gradient(135deg, #F0E68C 0%, #D4AF37 100%)',
  },
  nav: {
    surface: 'rgba(30, 30, 40, 0.95)',
    ink: '#e5e7eb',
    keyOn: '#10b981',
    keyOff: '#fbbf24',
  },
  loader: {
    scrim: 'rgba(0, 0, 0, 0.7)',
    toast: 'rgba(0,0,0,0.6)',
    track: 'rgba(255,255,255,0.3)',
    spinner: '#fff',
    pageSpinner: '#3b82f6',
  },
  zoomBadge: {
    surface: 'rgba(255,255,255,0.85)',
    ink: '#334155',
  },
  attention: {
    glow: 'rgba(168, 85, 247, 0.65)',
    glowPeak: 'rgba(236, 72, 153, 0.9)',
  },
};

export function paperPanel({ paper, ink }: PaperPair): PanelTokens {
  return {
    page: paper,
    surface: {
      panel: alpha(paper, 0.92),
      drawer: alpha(paper, 0.94),
      menu: alpha(paper, 0.97),
      toggle: alpha(paper, 0.85),
      toggleHover: alpha(paper, 0.95),
      pill: alpha(paper, 0.7),
      inset: alpha(ink, 0.04),
      well: alpha(ink, 0.03),
      control: alpha(ink, 0.05),
      controlHover: alpha(ink, 0.1),
    },
    border: {
      accent: alpha(ink, 0.25),
      accentHover: alpha(ink, 0.5),
      hairline: alpha(ink, 0.08),
      subtle: alpha(ink, 0.15),
      subtleHover: alpha(ink, 0.3),
      field: alpha(ink, 0.15),
      fieldHover: alpha(ink, 0.35),
      fieldFocus: alpha(ink, 0.6),
    },
    tint: {
      accent: alpha(ink, 0.06),
      secondary: alpha(ink, 0.04),
    },
    ink: {
      inherited: ink,
      strong: ink,
      soft: alpha(ink, 0.9),
      body: alpha(ink, 0.75),
      muted: alpha(ink, 0.65),
      faint: alpha(ink, 0.55),
      ghost: alpha(ink, 0.4),
      disabled: alpha(ink, 0.3),
      onAccent: paper,
    },
    shadow: {
      raised: alpha(ink, 0.18),
      floating: alpha(ink, 0.14),
      soft: alpha(ink, 0.1),
    },
    fill: {
      findMe: ink,
      accent: ink,
      accentHover: alpha(ink, 0.85),
    },
    nav: {
      surface: alpha(paper, 0.95),
      ink,
      keyOn: ink,
      keyOff: alpha(ink, 0.5),
    },
    loader: {
      scrim: alpha(paper, 0.8),
      toast: alpha(paper, 0.92),
      track: alpha(ink, 0.2),
      spinner: ink,
      pageSpinner: ink,
    },
    zoomBadge: {
      surface: alpha(paper, 0.9),
      ink,
    },
    attention: {
      glow: alpha(PAPER_ACCENT, 0.45),
      glowPeak: alpha(PAPER_ACCENT, 0.75),
    },
  };
}
