import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled render error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center p-8">
          <div className="max-w-md rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-500/30 dark:bg-red-500/10">
            <h1 className="text-lg font-bold text-red-700 dark:text-red-300">Something went wrong</h1>
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              An unexpected error occurred. Please refresh the page to try again.
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}