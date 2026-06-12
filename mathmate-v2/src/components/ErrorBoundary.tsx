import { Component, type ReactNode, type ErrorInfo } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div
            style={{
              padding: "8px 12px",
              color: "var(--color-red)",
              fontSize: 12,
              background: "var(--color-error-bg, #3a1a1a)",
              borderRadius: 6,
              margin: 4,
            }}
          >
            <AlertTriangle size={14} style={{ marginRight: 4, verticalAlign: "middle" }} /> Render error — {this.state.error?.message ?? "unknown"}
          </div>
        )
      );
    }
    return this.props.children;
  }
}
