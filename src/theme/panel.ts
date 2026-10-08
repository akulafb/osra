import { livePair } from './paperPair';

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
    secondaryHover: string;
    successHover: string;
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
  role: {
    primary: string;
    secondary: string;
    secondaryLight: string;
    success: string;
    successLight: string;
    error: string;
    text: string;
    textSecondary: string;
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
    secondaryHover: 'rgba(124, 58, 237, 0.1)',
    successHover: 'rgba(16, 185, 129, 0.1)',
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
  role: {
    primary: '#D4AF37',
    secondary: '#7c3aed',
    secondaryLight: 'rgb(150, 97, 240)',
    success: '#10b981',
    successLight: 'rgb(63, 199, 154)',
    error: '#ef4444',
    text: '#ede9fe',
    textSecondary: '#a78bfa',
  },
};

export function paperPanel(): PanelTokens {
  const { paper, ink, accent } = livePair;
  return {
    page: paper(),
    surface: {
      panel: paper(0.92),
      drawer: paper(0.94),
      menu: paper(0.97),
      toggle: paper(0.85),
      toggleHover: paper(0.95),
      pill: paper(0.7),
      inset: ink(0.04),
      well: ink(0.03),
      control: ink(0.05),
      controlHover: ink(0.1),
    },
    border: {
      accent: ink(0.25),
      accentHover: ink(0.5),
      hairline: ink(0.08),
      subtle: ink(0.15),
      subtleHover: ink(0.3),
      field: ink(0.15),
      fieldHover: ink(0.35),
      fieldFocus: ink(0.6),
    },
    tint: {
      accent: ink(0.06),
      secondary: ink(0.04),
      secondaryHover: ink(0.1),
      successHover: ink(0.1),
    },
    ink: {
      inherited: ink(),
      strong: ink(),
      soft: ink(0.9),
      body: ink(0.75),
      muted: ink(0.65),
      faint: ink(0.55),
      ghost: ink(0.4),
      disabled: ink(0.3),
      onAccent: paper(),
    },
    shadow: {
      raised: ink(0.18),
      floating: ink(0.14),
      soft: ink(0.1),
    },
    fill: {
      findMe: ink(),
      accent: ink(),
      accentHover: ink(0.85),
    },
    nav: {
      surface: paper(0.95),
      ink: ink(),
      keyOn: ink(),
      keyOff: ink(0.5),
    },
    loader: {
      scrim: paper(0.8),
      toast: paper(0.92),
      track: ink(0.2),
      spinner: ink(),
      pageSpinner: ink(),
    },
    zoomBadge: {
      surface: paper(0.9),
      ink: ink(),
    },
    attention: {
      glow: accent(0.45),
      glowPeak: accent(0.75),
    },
    role: {
      primary: ink(),
      secondary: ink(),
      secondaryLight: ink(0.75),
      success: ink(),
      successLight: ink(0.75),
      error: accent(),
      text: ink(),
      textSecondary: ink(0.7),
    },
  };
}
