import React from 'react';
import { Button } from 'antd';
import { translate, type AppLanguage } from '../../i18n';

interface DataGridErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

type DataGridErrorBoundaryProps = {
    children: React.ReactNode;
    language: AppLanguage;
};

export class DataGridErrorBoundary extends React.Component<
    DataGridErrorBoundaryProps,
    DataGridErrorBoundaryState
> {
    constructor(props: DataGridErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): DataGridErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('DataGrid render error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: 16, color: '#ff4d4f' }}>
                    <h4>{translate(this.props.language, 'generic.fallback.renderError.title')}</h4>
                    <p>{translate(this.props.language, 'generic.fallback.renderError.description')}</p>
                    <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {this.state.error?.message}
                    </pre>
                    <Button
                        size="small"
                        onClick={() => this.setState({ hasError: false, error: null })}
                    >
                        {translate(this.props.language, 'generic.fallback.retry')}
                    </Button>
                </div>
            );
        }
        return this.props.children;
    }
}
