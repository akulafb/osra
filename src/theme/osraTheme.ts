import { alpha, createTheme, type ThemeOptions } from '@mui/material/styles';
import { cosmosChat, paperChat } from './chat';
import { cosmosHud, paperHud } from './hud';
import { cosmosModal, paperModal } from './modal';
import { cosmosPanel, paperPanel } from './panel';
import { PAPER_ACCENT, type PaperPair } from './paperPair';

const shared: Pick<ThemeOptions, 'typography' | 'components'> = {
  typography: {
    fontFamily: '"Inter", "Lora", Georgia, serif',
    h1: { fontFamily: '"Lora", serif' },
    h2: { fontFamily: '"Lora", serif' },
    h3: { fontFamily: '"Lora", serif' },
    h4: { fontFamily: '"Lora", serif' },
    h5: { fontFamily: '"Lora", serif' },
    h6: { fontFamily: '"Lora", serif' },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: '4px',
          letterSpacing: '0.05em',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
  },
};

export const osraTheme = createTheme({
  ...shared,
  palette: {
    mode: 'dark',
    primary: {
      main: '#D4AF37', // Champagne Gold
      dark: '#B8860B',
      light: '#F0E68C',
    },
    secondary: {
      main: '#7c3aed', // Royal Purple
    },
    success: {
      main: '#10b981',
    },
    error: {
      main: '#ef4444',
    },
    warning: {
      main: '#f59e0b',
    },
    background: {
      default: '#050505', // Deep Midnight
      paper: '#0a0a0a',
    },
    text: {
      primary: '#ede9fe',
      secondary: '#a78bfa',
    },
    panel: cosmosPanel,
    hud: cosmosHud,
    chat: cosmosChat,
    modal: cosmosModal,
  },
});

export function createPaperTheme(pair: PaperPair) {
  const { paper, ink } = pair;
  return createTheme({
    ...shared,
    palette: {
      mode: 'light',
      primary: { main: ink, contrastText: paper },
      secondary: { main: ink, contrastText: paper },
      success: { main: ink },
      error: { main: PAPER_ACCENT },
      warning: { main: ink },
      background: { default: paper, paper },
      text: { primary: ink, secondary: alpha(ink, 0.7) },
      panel: paperPanel(pair),
      hud: paperHud(pair),
      chat: paperChat(pair),
      modal: paperModal(pair),
    },
  });
}
