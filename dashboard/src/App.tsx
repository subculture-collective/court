import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { SessionMonitor } from './components/SessionMonitor';
import { useSSE } from './hooks/useSSE';
import { mapSessionToSnapshot } from './session-snapshot';
import type { CourtEvent, SessionSnapshot } from './types';

type DashboardTabId = 'monitor' | 'moderation' | 'controls' | 'analytics';

const loadModerationQueue = () => import('./components/ModerationQueue');
const loadManualControls = () => import('./components/ManualControls');
const loadAnalytics = () => import('./components/Analytics');

const ModerationQueue = lazy(async () => {
    const module = await loadModerationQueue();
    return { default: module.ModerationQueue };
});

const ManualControls = lazy(async () => {
    const module = await loadManualControls();
    return { default: module.ManualControls };
});

const Analytics = lazy(async () => {
    const module = await loadAnalytics();
    return { default: module.Analytics };
});

const TABS = [
    { id: 'monitor', label: 'Session Monitor', icon: '📊' },
    {
        id: 'moderation',
        label: 'Moderation Queue',
        icon: '🛡️',
        preload: loadModerationQueue,
    },
    {
        id: 'controls',
        label: 'Manual Controls',
        icon: '🎛️',
        preload: loadManualControls,
    },
    {
        id: 'analytics',
        label: 'Analytics',
        icon: '📈',
        preload: loadAnalytics,
    },
] as const satisfies ReadonlyArray<{
    id: DashboardTabId;
    label: string;
    icon: string;
    preload?: () => Promise<unknown>;
}>;

function TabFallback({ message }: { message: string }) {
    return (
        <div className='flex items-center justify-center py-12'>
            <div className='text-gray-400'>{message}</div>
        </div>
    );
}

function App() {
    const [activeTab, setActiveTab] = useState<DashboardTabId>('monitor');
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [sessionSnapshot, setSessionSnapshot] =
        useState<SessionSnapshot | null>(null);
    const [events, setEvents] = useState<CourtEvent[]>([]);
    const [sessionLookupLoading, setSessionLookupLoading] = useState(true);
    const [sessionSnapshotLoading, setSessionSnapshotLoading] = useState(false);

    const handleSSEEvent = useCallback((event: CourtEvent) => {
        setEvents(prev => [...prev, event]);
    }, []);

    const handleSSESnapshot = useCallback(
        (payload: Record<string, unknown>) => {
            const nextSnapshot = mapSessionToSnapshot({
                session: payload.session,
                turns: payload.turns,
                recapTurnIds: payload.recapTurnIds,
            });

            if (!nextSnapshot) {
                return;
            }

            setSessionSnapshot(nextSnapshot);
            setSessionSnapshotLoading(false);
        },
        [],
    );

    const { connected, error } = useSSE(
        sessionId,
        handleSSEEvent,
        handleSSESnapshot,
    );

    useEffect(() => {
        let cancelled = false;

        // Fetch current session on mount
        fetch('/api/court/sessions')
            .then(res => {
                if (!res.ok) {
                    throw new Error(`Unexpected status ${res.status}`);
                }
                return res.json();
            })
            .then(sessionsResponse => {
                if (cancelled) {
                    return;
                }

                let id: string | null = null;

                if (
                    Array.isArray(sessionsResponse.sessions) &&
                    sessionsResponse.sessions.length > 0
                ) {
                    const first = sessionsResponse.sessions[0] as
                        | { id?: string; sessionId?: string }
                        | undefined;
                    id = first?.id ?? first?.sessionId ?? null;
                }

                if (id) {
                    setSessionId(id);
                }
            })
            .catch(err => console.error('Failed to fetch session:', err))
            .finally(() => {
                if (!cancelled) {
                    setSessionLookupLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!sessionId) {
            setEvents([]);
            setSessionSnapshot(null);
            setSessionSnapshotLoading(false);
            return;
        }

        let cancelled = false;
        setEvents([]);
        setSessionSnapshot(null);
        setSessionSnapshotLoading(true);

        fetch(`/api/court/sessions/${sessionId}`)
            .then(res => {
                if (!res.ok) {
                    throw new Error(`Unexpected status ${res.status}`);
                }

                return res.json();
            })
            .then(data => {
                if (cancelled) {
                    return;
                }

                const nextSnapshot = mapSessionToSnapshot({
                    session: data.session,
                });

                if (!nextSnapshot) {
                    return;
                }

                setSessionSnapshot(current => current ?? nextSnapshot);
            })
            .catch(err =>
                console.error('Failed to fetch session snapshot:', err),
            )
            .finally(() => {
                if (!cancelled) {
                    setSessionSnapshotLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [sessionId]);

    const isSessionMonitorLoading =
        sessionLookupLoading ||
        (Boolean(sessionId) &&
            sessionSnapshotLoading &&
            sessionSnapshot === null);

    const renderActiveTab = () => {
        switch (activeTab) {
            case 'monitor':
                return (
                    <SessionMonitor
                        events={events}
                        snapshot={sessionSnapshot}
                        loading={isSessionMonitorLoading}
                    />
                );
            case 'moderation':
                return (
                    <Suspense
                        fallback={
                            <TabFallback message='Loading moderation queue...' />
                        }
                    >
                        <ModerationQueue events={events} />
                    </Suspense>
                );
            case 'controls':
                return (
                    <Suspense
                        fallback={
                            <TabFallback message='Loading manual controls...' />
                        }
                    >
                        <ManualControls sessionId={sessionId} />
                    </Suspense>
                );
            case 'analytics':
                return (
                    <Suspense
                        fallback={
                            <TabFallback message='Loading analytics...' />
                        }
                    >
                        <Analytics events={events} />
                    </Suspense>
                );
            default:
                return null;
        }
    };

    return (
        <div className='min-h-screen bg-gray-900 text-white'>
            {/* Header */}
            <header className='bg-gray-800 border-b border-gray-700 shadow-lg'>
                <div className='container mx-auto px-4 py-4'>
                    <div className='flex items-center justify-between'>
                        <div>
                            <h1 className='text-2xl font-bold text-primary-400'>
                                JuryRigged
                            </h1>
                            <p className='text-sm text-gray-400'>
                                Operator Dashboard
                            </p>
                        </div>
                        <div className='flex items-center gap-4'>
                            {sessionId && (
                                <div className='text-sm text-gray-400'>
                                    <span className='font-medium'>
                                        Session:
                                    </span>{' '}
                                    <span className='font-mono text-primary-400'>
                                        {sessionId.slice(0, 8)}
                                    </span>
                                </div>
                            )}
                            <div className='flex items-center gap-2'>
                                <div
                                    className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}
                                />
                                <span className='text-sm text-gray-400'>
                                    {connected ? 'Connected' : 'Disconnected'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Tab Navigation */}
            <nav className='bg-gray-800 border-b border-gray-700'>
                <div className='container mx-auto px-4'>
                    <div className='flex gap-1'>
                        {TABS.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                onMouseEnter={() => {
                                    if (tab.preload) {
                                        void tab.preload();
                                    }
                                }}
                                onFocus={() => {
                                    if (tab.preload) {
                                        void tab.preload();
                                    }
                                }}
                                className={`px-6 py-3 font-medium transition-colors ${
                                    activeTab === tab.id ?
                                        'bg-gray-900 text-primary-400 border-b-2 border-primary-400'
                                    :   'text-gray-400 hover:text-white hover:bg-gray-700'
                                }`}
                            >
                                <span className='mr-2'>{tab.icon}</span>
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
            </nav>

            {/* Error Banner */}
            {error && (
                <div className='bg-red-900 border-l-4 border-red-500 text-white p-4'>
                    <div className='container mx-auto'>
                        <p className='font-medium'>Connection Error</p>
                        <p className='text-sm text-red-200'>{error}</p>
                    </div>
                </div>
            )}

            {/* Main Content */}
            <main className='container mx-auto px-4 py-6'>
                {renderActiveTab()}
            </main>
        </div>
    );
}

export default App;
