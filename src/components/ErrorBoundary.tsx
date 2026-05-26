import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  name?: string;
  /**
   * Story 67-1: invoked from componentDidCatch when a child render subtree
   * crashes. App wires this to send a CLIENT_ERROR over the still-open socket
   * so the server releases this player from the turn barrier instead of
   * orphaning the whole table's in-flight turn. Optional — boundaries with no
   * turn-loop stake (Connect, Character Creation) leave it unset.
   */
  onCrashReport?: (info: { name?: string; error: Error }) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `[ErrorBoundary${this.props.name ? `: ${this.props.name}` : ""}]`,
      error,
      info.componentStack,
    );
    // Story 67-1: report the crash before rendering the recovery UI so the
    // server can release this player from the turn barrier. Guarded so a
    // failure in the reporter can never re-throw out of the boundary.
    if (this.props.onCrashReport) {
      try {
        this.props.onCrashReport({ name: this.props.name, error });
      } catch (reportErr) {
        console.error("[ErrorBoundary] onCrashReport failed", reportErr);
      }
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center p-8 gap-4 text-center">
          <p className="text-sm text-muted-foreground">
            Something went wrong{this.props.name ? ` in ${this.props.name}` : ""}.
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="text-sm underline text-primary hover:text-primary/80"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
