import { createTheme } from '@mui/material/styles';
import { cosmosChat } from './chat';
import { cosmosHud } from './hud';
import { cosmosModal } from './modal';
import { cosmosPanel } from './panel';

export const osraTheme = createTheme({
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
