import { Component, type ErrorInfo, type ReactNode } from 'react';
import { downloadBlob } from '../../util/download';
import { listBrowserCopies, type BrowserCopy } from '../../state/recovery/copies';

const copiesNow = (): BrowserCopy[] => {
  try {
    return listBrowserCopies();
  } catch {
    return [];
  }
};

interface State {
  error: Error | null;
}

/**
 * Catches a failure while drawing, so a project that cannot be shown does not leave a blank page and lose the work: every copy
 * kept in the browser can be downloaded, each on its own, before reloading.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('OctavaPlot failed to draw:', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    const copies = copiesNow();
    return (
      <div role="alert" style={{ padding: 24, maxWidth: 640, font: '14px/1.5 system-ui, sans-serif' }}>
        <h1 style={{ fontSize: 18 }}>Something went wrong while drawing</h1>
        <p>{this.state.error.message}</p>
        <p>
          {copies.length > 0
            ? 'These copies of the project are stored in this browser. Download what you need before reloading.'
            : 'No copy of the project was found in this browser.'}
        </p>
        <p style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {copies.map((c) => (
            <button key={c.id} onClick={() => downloadBlob(new Blob([c.text], { type: 'application/json' }), c.filename)}>Download: {c.label}</button>
          ))}
          <button onClick={() => window.location.reload()}>Reload</button>
        </p>
      </div>
    );
  }
}
