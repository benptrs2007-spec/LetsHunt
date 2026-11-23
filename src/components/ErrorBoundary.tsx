import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string | null;
}

/**
 * Top-level React error boundary.
 *
 * Without this, any uncaught render-time exception (including, historically, an
 * unguarded JSON.parse against corrupted localStorage data) unmounts the whole
 * tree and leaves a blank white page on the user's phone with no recovery path.
 *
 * On crash: log the error to the console, render a friendly recovery screen,
 * and offer a single "Reload app" button. Saved data is preserved —
 * `localStorage` keys are not wiped.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, errorMessage: null };

  static getDerivedStateFromError(error: unknown): State {
    const msg = error instanceof Error ? error.message : String(error);
    return { hasError: true, errorMessage: msg };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('LetsHunt crashed:', error, info);
  }

  handleReload = () => {
    try { window.location.reload(); } catch { /* no-op in tests */ }
  };

  handleResetStorage = () => {
    try { localStorage.clear(); } catch { /* ignore */ }
    this.handleReload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            textAlign: 'center',
            fontFamily:
              'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
            background: 'rgb(var(--ui-surface-rgb))',
            color: 'rgb(var(--ui-text-rgb))',
          }}
        >
          <div
            style={{
              maxWidth: 480,
              padding: 32,
              borderRadius: 16,
              background: 'rgb(var(--ui-surface-soft-rgb))',
              border: '1px solid rgb(var(--ui-border-rgb))',
              boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
            }}
          >
            <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
              Something went wrong
            </h1>
            <p style={{ fontSize: 14, color: 'rgb(var(--ui-muted-rgb))', marginBottom: 8 }}>
              Your saved data is safe. Reload to continue.
            </p>
            {this.state.errorMessage && (
              <details
                style={{
                  marginTop: 12,
                  marginBottom: 20,
                  fontSize: 12,
                  color: 'rgb(var(--ui-muted-rgb))',
                  textAlign: 'left',
                }}
              >
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                  Error details
                </summary>
                <pre
                  style={{
                    marginTop: 8,
                    padding: 12,
                    background: 'rgb(var(--ui-surface-rgb))',
                    borderRadius: 8,
                    overflow: 'auto',
                    maxHeight: 200,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {this.state.errorMessage}
                </pre>
              </details>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={this.handleReload}
                style={{
                  padding: '12px 20px',
                  fontWeight: 700,
                  fontSize: 14,
                  color: 'rgb(var(--ui-surface-rgb))',
                  background: 'rgb(var(--ui-accent-rgb))',
                  border: 'none',
                  borderRadius: 10,
                  cursor: 'pointer',
                }}
              >
                Reload app
              </button>
              <button
                onClick={this.handleResetStorage}
                style={{
                  padding: '10px 16px',
                  fontSize: 12,
                  color: 'rgb(var(--ui-muted-rgb))',
                  background: 'transparent',
                  border: '1px solid rgb(var(--ui-border-rgb))',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                Reset saved data & reload
              </button>
            </div>
          </div>
        </div>
      );
    }
    return (this as React.Component<Props, State>).props.children;
  }
}

export default ErrorBoundary;
