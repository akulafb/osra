import React from 'react';

export function PaperWebGLFallback({ paper, ink }: { paper: string; ink: string }) {
  return (
    <div
      role="alert"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: paper,
        color: ink,
        fontFamily: 'monospace',
        textAlign: 'center',
        letterSpacing: '0.04em',
      }}
    >
      <div style={{ maxWidth: 420 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>THE 3D TREE NEEDS WEBGL</div>
        <div style={{ fontSize: '0.9rem', lineHeight: 1.5 }}>
          This browser has WebGL turned off or does not support it. Switch to 2D in INSTRUMENTS, or open the tree in
          another browser.
        </div>
      </div>
    </div>
  );
}

/** Shows the fallback if the renderer fails after the WebGL check passed, such as a context the GPU refuses. */
export class PaperWebGLBoundary extends React.Component<
  { fallback: React.ReactNode; onError: () => void; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[PaperTree3D] WebGL scene failed:', error);
    this.props.onError();
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
