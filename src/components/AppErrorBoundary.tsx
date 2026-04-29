import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    message: ""
  };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Guide Allocation Studio crashed:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="app-shell">
          <section className="shell-card settings-panel" style={{ position: "static", width: "100%" }}>
            <div className="panel-head">
              <div>
                <p className="eyebrow">Runtime error</p>
                <h2>The app hit an error while rendering</h2>
              </div>
            </div>
            <p className="muted">
              {this.state.message || "Unknown error"}
            </p>
            <p className="muted">
              Refresh the page after the fix, or check the browser console for the full stack trace.
            </p>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
