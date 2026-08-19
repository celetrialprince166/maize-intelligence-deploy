import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex items-center justify-center w-full h-full bg-black text-white/50 p-4 text-center border border-white/10 rounded-lg">
           <div className="flex flex-col items-center gap-2">
             <span className="text-xl font-bold text-red-400">Component Error</span>
             <p className="text-sm">Something went wrong in this view.</p>
           </div>
        </div>
      );
    }

    return this.props.children;
  }
}
