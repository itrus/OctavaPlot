import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AUTOSAVE_BACKUP_KEY, AUTOSAVE_KEY } from '../state/serialize';

/** The most recent copy of the project kept in the browser, for the recovery download; null when there is none. */
function storedProject(): string | null {
  try {
    return localStorage.getItem(AUTOSAVE_KEY) ?? localStorage.getItem(AUTOSAVE_BACKUP_KEY);
  } catch {
    return null;
  }
}

interface State {
  error: Error | null;
}

/**
 * Catches a failure while drawing, so a project that cannot be shown does not leave a blank page and lose the work: the
 * last autosaved copy can be downloaded before reloading.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('OctavaPlot failed to draw:', error, info.componentStack);
  }

  private download = () => {
    const text = storedProject();
    if (!text) return;
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'octavaplot-recovered.oplot';
    a.click();
    URL.revokeObjectURL(url);
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    const hasCopy = storedProject() !== null;
    return (
      <div role="alert" style={{ padding: 24, maxWidth: 640, font: '14px/1.5 system-ui, sans-serif' }}>
        <h1 style={{ fontSize: 18 }}>Something went wrong while drawing</h1>
        <p>{this.state.error.message}</p>
        <p>
          {hasCopy
            ? 'Your last autosaved project is still stored in this browser. Download it before reloading.'
            : 'No autosaved copy of the project was found in this browser.'}
        </p>
        <p style={{ display: 'flex', gap: 8 }}>
          <button onClick={this.download} disabled={!hasCopy}>Download the autosaved project</button>
          <button onClick={() => window.location.reload()}>Reload</button>
        </p>
      </div>
    );
  }
}
