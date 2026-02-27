import React, { useState, useEffect } from 'react';
import { SessionMonitor } from './components/SessionMonitor';
import { ModerationQueue } from './components/ModerationQueue';
import { ManualControls } from './components/ManualControls';
import { Analytics } from './components/Analytics';
import { useSSE } from './hooks/useSSE';
import type { CourtEvent } from './types';

function App() {
    const [activeTab, setActiveTab] = useState<
        'monitor' | 'moderation' | 'controls' | 'analytics'
    >('monitor');
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [events, setEvents] = useState<CourtEvent[]>([]);

    const { connected, error } = useSSE(sessionId, event => {
        setEvents(prev => [...prev, event]);
    });

    useEffect(() => {
        // Fetch current session on mount
        fetch('/api/court/sessions')
            .then(res => {
                if (!res.ok) {
                    throw new Error(`Unexpected status ${res.status}`);
                }
                return res.json();
            })
            .then(data => {
                let id: string | null = null;

                if (Array.isArray(data.sessions) && data.sessions.length > 0) {
                    const first = data.sessions[0] as any;
                    id = (first && (first.id || first.sessionId)) ?? null;
                }

                if (id) {
                    setSessionId(id);
                }
            })
            .catch(err => console.error('Failed to fetch session:', err));
    }, []);

    const tabs = [
        { id: 'monitor', label: 'Session Monitor', icon: '📊' },
        { id: 'moderation', label: 'Moderation Queue', icon: '🛡️' },
        { id: 'controls', label: 'Manual Controls', icon: '🎛️' },
        { id: 'analytics', label: 'Analytics', icon: '📈' },
    ] as const;

    return (
        <div className='min-h-screen bg-gray-900 text-white'>
            {/* Header */}
            <header className='bg-gray-800 border-b border-gray-700 shadow-lg'>
                <div className='container mx-auto px-4 py-4'>
                    <div className='flex items-center justify-between'>
                        <div>
                            <h1 className='text-2xl font-bold text-primary-400'>
                                Improv Court
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
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
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
                {activeTab === 'monitor' && (
                    <SessionMonitor events={events} sessionId={sessionId} />
                )}
                {activeTab === 'moderation' && (
                    <ModerationQueue events={events} />
                )}
                {activeTab === 'controls' && (
                    <ManualControls sessionId={sessionId} />
                )}
                {activeTab === 'analytics' && <Analytics events={events} />}
            </main>
        </div>
    );
}

export default App;
