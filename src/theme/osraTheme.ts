import { alpha, createTheme, type ThemeOptions } from '@mui/material/styles';
import { cosmosChat, paperChat } from './chat';
import { cosmosHud, paperHud } from './hud';
import { cosmosModal, paperModal } from './modal';
import { cosmosPanel, paperPanel } from './panel';
import { contrastRatio } from '../lib/colourBlend';
import { livePair, type PaperPair } from './paperPair';

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
      main: cosmosPanel.role.primary, // Champagne Gold
      dark: '#B8860B',
      light: '#F0E68C',
    },
    secondary: {
      main: cosmosPanel.role.secondary, // Royal Purple
    },
    success: {
      main: cosmosPanel.role.success,
    },
    error: {
      main: cosmosPanel.role.error,
    },
    warning: {
      main: '#f59e0b',
    },
    background: {
      default: '#050505', // Deep Midnight
      paper: '#0a0a0a',
    },
    text: {
      primary: cosmosPanel.role.text,
      secondary: cosmosPanel.role.textSecondary,
    },
    panel: cosmosPanel,
    hud: cosmosHud,
    chat: cosmosChat,
    modal: cosmosModal,
  },
});

export function createPaperTheme(pair: PaperPair) {
  const { paper, ink, accent } = pair;
  const { paper: livePaper, ink: liveInk, accent: liveAccent } = livePair;
  const filled = (fill: typeof liveInk) => ({
    backgroundColor: fill(),
    color: livePaper(),
    '&:hover': { backgroundColor: fill(0.85) },
  });
  return createTheme({
    ...shared,
    components: {
      ...shared.components,
      MuiButton: {
        ...shared.components?.MuiButton,
        variants: [
          { props: { variant: 'contained', color: 'primary' }, style: filled(liveInk) },
          { props: { variant: 'contained', color: 'secondary' }, style: filled(liveInk) },
          { props: { variant: 'contained', color: 'error' }, style: filled(liveAccent) },
          { props: { variant: 'outlined', color: 'primary' }, style: { color: liveInk(), borderColor: liveInk(0.5) } },
          { props: { variant: 'text', color: 'primary' }, style: { color: liveInk() } },
        ],
      },
    },
    palette: {
      mode: contrastRatio(paper, '#ffffff') > contrastRatio(paper, '#000000') ? 'dark' : 'light',
      primary: { main: ink, contrastText: paper },
      secondary: { main: ink, contrastText: paper },
      success: { main: ink },
      error: { main: accent },
      warning: { main: ink },
      background: { default: paper, paper },
      text: { primary: ink, secondary: alpha(ink, 0.7) },
      panel: paperPanel(),
      hud: paperHud(),
      chat: paperChat(),
      modal: paperModal(),
    },
  });
}
