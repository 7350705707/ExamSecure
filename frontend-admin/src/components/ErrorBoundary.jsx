import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Uncaught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-950 p-8">
          <div className="bg-gray-900 border border-red-700 rounded-xl p-8 max-w-lg w-full text-center shadow-2xl">
            <div className="text-4xl mb-4">⚠️</div>
            <h1 className="text-xl font-bold text-red-400 mb-2">Something went wrong</h1>
            <p className="text-sm text-gray-400 mb-4">
              An unexpected error occurred. Please reload the page.
            </p>
            {this.state.error && (
              <pre className="text-xs text-left bg-gray-800 border border-gray-700 rounded p-3 overflow-auto text-red-300 mb-4">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2 rounded-lg bg-indigo-700 hover:bg-indigo-600 text-white text-sm font-semibold transition"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
