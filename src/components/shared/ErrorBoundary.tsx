import { Component, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import i18n from '@/i18n';

interface Props { children: ReactNode; fallbackMessage?: string; }
interface State { hasError: boolean; error?: Error; }

/**
 * ErrorBoundary — catches React render errors and shows a recovery UI.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error('[ErrorBoundary]', error, info);
  }

  handleRetry = () => this.setState({ hasError: false, error: undefined });

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full min-h-[300px] p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-aegis-danger/10 border border-aegis-danger/20 flex items-center justify-center mb-4">
            <AlertCircle size={28} className="text-aegis-danger" />
          </div>
          <h3 className="text-[16px] font-semibold text-aegis-text mb-2">{i18n.t('errors.unexpected')}</h3>
          <p className="text-[12px] text-aegis-text-dim mb-4 max-w-[400px]">
            {this.props.fallbackMessage || this.state.error?.message || i18n.t('errors.tryAgain')}
          </p>
          <button onClick={this.handleRetry}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-aegis-primary/10 text-aegis-primary border border-aegis-primary/20 text-[13px] font-medium hover:bg-aegis-primary/20 transition-colors">
            <RefreshCw size={14} /> {i18n.t('errors.retry')}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
