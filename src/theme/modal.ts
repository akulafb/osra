export interface ModalTokens {
  scrim: string;
  surface: string;
  previewShadow: string;
  submit: string;
  optionSurface: string;
  field: {
    surface: string;
    border: string;
  };
  ink: {
    hint: string;
    meta: string;
    secondary: string;
  };
  notice: {
    surface: string;
    border: string;
  };
  status: {
    successSurface: string;
    successBorder: string;
    errorSurface: string;
    errorBorder: string;
  };
  flat: {
    scrim: string;
    surface: string;
    raised: string;
    well: string;
    shadow: string;
    border: string;
    errorSurface: string;
    ink: {
      soft: string;
      muted: string;
      faint: string;
      ghost: string;
    };
    badge: {
      existing: string;
      generated: string;
    };
    tag: {
      surface: string;
      ink: string;
    };
  };
  admin: {
    scrim: string;
    surface: string;
    rule: string;
    field: {
      surface: string;
      border: string;
    };
  };
}

declare module '@mui/material/styles' {
  interface Palette {
    modal: ModalTokens;
  }
  interface PaletteOptions {
    modal?: ModalTokens;
  }
}

export const cosmosModal: ModalTokens = {
  scrim: 'rgba(0, 0, 0, 0.8)',
  surface: 'rgba(5, 5, 5, 0.85)',
  previewShadow: 'rgba(0,0,0,0.55)',
  submit: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
  optionSurface: 'rgba(0,0,0,0.2)',
  field: {
    surface: 'rgba(255,255,255,0.03)',
    border: 'rgba(255,255,255,0.1)',
  },
  ink: {
    hint: 'rgba(255,255,255,0.4)',
    meta: 'rgba(255,255,255,0.55)',
    secondary: 'rgba(255,255,255,0.8)',
  },
  notice: {
    surface: 'rgba(212, 175, 55, 0.05)',
    border: 'rgba(212, 175, 55, 0.3)',
  },
  status: {
    successSurface: 'rgba(16, 185, 129, 0.1)',
    successBorder: 'rgba(16, 185, 129, 0.3)',
    errorSurface: 'rgba(239, 68, 68, 0.1)',
    errorBorder: 'rgba(239, 68, 68, 0.3)',
  },
  flat: {
    scrim: 'rgba(0, 0, 0, 0.85)',
    surface: '#1a1a1a',
    raised: '#252525',
    well: '#1a1a1a',
    shadow: 'rgba(0,0,0,0.8)',
    border: '#333',
    errorSurface: 'rgba(239, 68, 68, 0.15)',
    ink: {
      soft: '#ddd',
      muted: '#aaa',
      faint: '#888',
      ghost: '#666',
    },
    badge: {
      existing: 'rgba(245, 158, 11, 0.2)',
      generated: 'rgba(16, 185, 129, 0.2)',
    },
    tag: {
      surface: 'rgba(102, 126, 134, 0.2)',
      ink: '#667eea',
    },
  },
  admin: {
    scrim: 'rgba(0,0,0,0.75)',
    surface: '#1a1a24',
    rule: '#444',
    field: {
      surface: '#111',
      border: '#444',
    },
  },
};
