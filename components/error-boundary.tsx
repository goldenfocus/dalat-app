"use client";

import { Component, startTransition, useEffect, type ReactNode } from "react";
import { unstable_rethrow, usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  planRecovery,
  reloadOnce,
  rememberErrorLabels,
  whenReachable,
  type ErrorLabels,
} from "@/lib/errors/recovery";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface InnerProps extends Props {
  pathname: string | null;
  labels: ErrorLabels & { loading: string };
  /** Re-fetches the route's server data. */
  onRefetch: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  /** An automatic retry is pending: show a spinner, not the error screen. */
  recovering: boolean;
}

const CLEAR: State = { hasError: false, error: null, recovering: false };

class ErrorBoundaryInner extends Component<InnerProps, State> {
  private recovery: AbortController | null = null;

  constructor(props: InnerProps) {
    super(props);
    this.state = CLEAR;
  }

  static getDerivedStateFromError(error: Error): State {
    // notFound()/redirect() throw control-flow errors that Next.js must
    // handle itself — catching them here would replace the 404 page with
    // a generic error screen.
    unstable_rethrow(error);
    return { hasError: true, error, recovering: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to error reporting service in production
    if (process.env.NODE_ENV === "production") {
      // TODO: Send to error tracking service (Sentry, etc.)
    }
    console.error("ErrorBoundary caught:", error, errorInfo);

    // Usually a navigation or refresh that lost its connection mid-stream, or
    // a tab older than the current build: both heal without the visitor.
    const plan = planRecovery(error);
    if (plan === "reload" && reloadOnce()) return;
    if (plan !== "retry" || navigator.onLine === false) {
      this.setState({ recovering: false });
    }
    if (plan === "retry") {
      this.recovery?.abort();
      this.recovery = new AbortController();
      whenReachable(this.recovery.signal).then(this.handleRetry, () => {});
    }
  }

  componentWillUnmount() {
    this.recovery?.abort();
  }

  componentDidUpdate(prevProps: InnerProps) {
    // This boundary lives in the locale layout, which persists across
    // client-side navigations — without this reset, one caught error
    // would keep showing the error screen on every subsequent route.
    if (this.state.hasError && prevProps.pathname !== this.props.pathname) {
      this.recovery?.abort();
      this.setState(CLEAR);
    }
  }

  // Clearing the error alone re-renders the same failed payload, so the retry
  // re-fetches it in the same transition.
  handleRetry = () => {
    this.recovery?.abort();
    startTransition(() => {
      this.props.onRefetch();
      this.setState(CLEAR);
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      if (this.state.recovering) {
        return (
          <div
            role="status"
            aria-label={this.props.labels.loading}
            className="flex min-h-[400px] items-center justify-center"
          >
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
          </div>
        );
      }

      return (
        <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="rounded-full bg-destructive/10 p-4">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">{this.props.labels.title}</h2>
            <p className="text-sm text-muted-foreground max-w-md">
              {this.props.labels.description}
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={this.handleRetry} variant="outline" size="sm">
              <RefreshCw className="mr-2 h-4 w-4" />
              {this.props.labels.tryAgain}
            </Button>
            <Button
              onClick={() => window.location.reload()}
              variant="default"
              size="sm"
            >
              {this.props.labels.refreshPage}
            </Button>
          </div>
          {process.env.NODE_ENV === "development" && this.state.error && (
            <details className="mt-4 max-w-lg text-left">
              <summary className="cursor-pointer text-sm text-muted-foreground">
                Error details
              </summary>
              <pre className="mt-2 overflow-auto rounded bg-muted p-4 text-xs">
                {this.state.error.message}
                {"\n\n"}
                {this.state.error.stack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export function ErrorBoundary({ children, fallback }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("errors");
  const tCommon = useTranslations("common");
  const title = t("somethingWentWrong");
  const description = t("unexpectedError");
  const tryAgain = t("tryAgain");
  const refreshPage = t("refreshPage");

  // The root error screens render outside the i18n provider and reuse these.
  useEffect(() => {
    rememberErrorLabels({ title, description, tryAgain, refreshPage });
  }, [title, description, tryAgain, refreshPage]);

  return (
    <ErrorBoundaryInner
      pathname={pathname}
      fallback={fallback}
      onRefetch={router.refresh}
      labels={{ title, description, tryAgain, refreshPage, loading: tCommon("loading") }}
    >
      {children}
    </ErrorBoundaryInner>
  );
}
