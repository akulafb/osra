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
