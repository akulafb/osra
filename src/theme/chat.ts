import { alpha } from '@mui/material/styles';
import { type PaperPair } from './paperPair';

export interface ChatTokens {
  surface: string;
  bar: string;
  border: string;
  inputBorder: string;
  bubble: string;
  userBubble: string;
  heading: string;
  ink: string;
  muted: string;
  hint: string;
  notice: string;
  shadow: string;
  buttonShadow: string;
}

declare module '@mui/material/styles' {
  interface Palette {
    chat: ChatTokens;
  }
  interface PaletteOptions {
    chat?: ChatTokens;
  }
}

export const cosmosChat: ChatTokens = {
  surface: '#1a1a1a',
  bar: '#2a2a2a',
  border: '#333',
  inputBorder: '#444',
  bubble: '#333',
  userBubble: '#3b82f6',
  heading: '#3b82f6',
  ink: '#fff',
  muted: '#888',
  hint: '#666',
  notice: '#fbbf24',
  shadow: 'rgba(0,0,0,0.5)',
  buttonShadow: 'rgba(0,0,0,0.3)',
};

export function paperChat({ paper, ink }: PaperPair): ChatTokens {
  return {
    surface: paper,
    bar: alpha(ink, 0.05),
    border: alpha(ink, 0.15),
    inputBorder: alpha(ink, 0.25),
    bubble: alpha(ink, 0.06),
    userBubble: alpha(ink, 0.14),
    heading: ink,
    ink,
    muted: alpha(ink, 0.6),
    hint: alpha(ink, 0.45),
    notice: ink,
    shadow: alpha(ink, 0.2),
    buttonShadow: alpha(ink, 0.15),
  };
}
