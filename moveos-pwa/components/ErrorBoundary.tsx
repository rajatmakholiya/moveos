'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './ui/Button';

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info);
    // Sentry.captureException(error)
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--surface-raised)] px-5 text-center">
        <h1 className="font-display text-title text-[var(--text-primary)]">Something went wrong on this page.</h1>
        <div className="mt-6 grid w-full max-w-xs grid-cols-2 gap-3">
          <Button onClick={() => this.setState({ hasError: false })}>Retry</Button>
          <Button variant="ghost" onClick={() => window.location.assign('/')}>
            Go home
          </Button>
        </div>
      </main>
    );
  }
}
