import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { osraTheme } from './theme/osraTheme';

const HomePage = lazy(() => import('./pages/HomePage'));
const InvitePage = lazy(() => import('./pages/InvitePage'));

function PageFallback() {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        minHeight: '100vh',
        background: '#0a0a0a',
        color: '#fff',
      }}
      aria-busy="true"
    >
      <div>Loading <span style={{ fontFamily: 'cursive', fontWeight: 'bold' }}>Osra</span>...</div>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider theme={osraTheme}>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/invite/:token" element={<InvitePage />} />
        </Routes>
      </Suspense>
      <Analytics />
      <SpeedInsights />
    </ThemeProvider>
  );
}

export default App;