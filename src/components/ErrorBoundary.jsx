import React from 'react';
import { AlertOctagon, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('FieldTrace crashed:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-ink px-6 text-center text-paper">
          <AlertOctagon size={40} className="text-signal-red" />
          <div>
            <h1 className="text-lg font-semibold">Something went wrong</h1>
            <p className="mt-1 max-w-xs text-sm text-line">
              The app hit an unexpected error. Your last entry may not have been saved — try again.
            </p>
          </div>
          <button
            onClick={() => {
              this.setState({ error: null });
              window.location.reload();
            }}
            className="tap-target flex items-center gap-2 border-2 border-amber bg-amber px-5 py-2.5 font-semibold text-ink"
          >
            <RefreshCw size={16} />
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
