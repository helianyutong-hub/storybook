import { Component, ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  /** 渲染出错时的兜底 UI 标签，用于在多页面共用一个 Boundary 时定位出错位置 */
  scope?: string;
}

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

/**
 * React 渲染错误边界：捕获子组件渲染过程中抛出的错误，避免整页空白。
 * - 渲染期抛错（hook 内、JSX、createPortal 子组件）不会被 window.onerror 抓到，
 *   只有 ErrorBoundary 能接住并显示兜底 UI + 真实错误信息。
 * - 用于诊断线上深链空白、组件内 silent crash 等疑难问题。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 同时记录到 console 和 state，方便排查
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary${this.props.scope ? ':' + this.props.scope : ''}]`, error, info);
    this.setState({ info });
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleBack = (): void => {
    if (window.history.length > 1) window.history.back();
    else window.location.href = '/';
  };

  render(): ReactNode {
    if (this.state.error) {
      const { error, info } = this.state;
      return (
        <div className="mx-auto max-w-2xl px-6 py-16">
          <div className="rounded-3xl border border-red-400/30 bg-red-500/[0.06] p-6">
            <h2 className="text-lg font-bold text-red-300">页面加载出错了</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              这不是您的问题，是代码侧的渲染崩溃。下方是错误详情（供排查用）。
            </p>
            {this.props.scope && (
              <p className="mt-2 text-xs text-muted-foreground">出错位置：{this.props.scope}</p>
            )}
            <pre className="mt-4 max-h-72 overflow-auto rounded-xl bg-black/40 p-3 text-[11px] leading-relaxed text-red-200">
              {error.name}: {error.message}
              {'\n\n'}
              {error.stack}
              {info?.componentStack && `\n\nComponent stack:${info.componentStack}`}
            </pre>
            <div className="mt-4 flex gap-2">
              <button
                onClick={this.handleReload}
                className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                重新加载页面
              </button>
              <button
                onClick={this.handleBack}
                className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold"
              >
                返回上一页
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}