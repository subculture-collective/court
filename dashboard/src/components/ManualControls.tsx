import React, { useState } from 'react';

interface ManualControlsProps {
    sessionId: string | null;
}

export function ManualControls({ sessionId }: ManualControlsProps) {
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{
        type: 'success' | 'error';
        text: string;
    } | null>(null);

    const handleAction = async (
        action: string,
        data?: Record<string, unknown>,
    ) => {
        if (!sessionId) {
            setMessage({ type: 'error', text: 'No active session' });
            return;
        }

        setLoading(true);
        setMessage(null);

        try {
            const response = await fetch(`/api/session/${action}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data || {}),
            });

            if (!response.ok) {
                throw new Error(`Action failed: ${response.statusText}`);
            }

            setMessage({
                type: 'success',
                text: `${action} completed successfully`,
            });
        } catch (err) {
            setMessage({ type: 'error', text: (err as Error).message });
        } finally {
            setLoading(false);
        }
    };

    const handleNewSession = async () => {
        setLoading(true);
        setMessage(null);

        try {
            const response = await fetch('/api/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });

            if (!response.ok) {
                throw new Error(
                    `Failed to create session: ${response.statusText}`,
                );
            }

            const data = await response.json();
            setMessage({
                type: 'success',
                text: `New session created: ${data.sessionId}`,
            });

            // Reload page to connect to new session
            setTimeout(() => window.location.reload(), 1500);
        } catch (err) {
            setMessage({ type: 'error', text: (err as Error).message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className='space-y-6'>
            {/* Status Message */}
            {message && (
                <div
                    className={`p-4 rounded-lg ${
                        message.type === 'success' ?
                            'bg-green-900/30 border border-green-700 text-green-300'
                        :   'bg-red-900/30 border border-red-700 text-red-300'
                    }`}
                >
                    {message.text}
                </div>
            )}

            {/* Session Control */}
            <div className='bg-gray-800 rounded-lg p-6 shadow-lg'>
                <h2 className='text-xl font-semibold mb-4 text-primary-400'>
                    Session Control
                </h2>
                <div className='space-y-3'>
                    <button
                        onClick={handleNewSession}
                        disabled={loading}
                        className='w-full px-4 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors'
                    >
                        {loading ? 'Processing...' : '🆕 Create New Session'}
                    </button>
                    {sessionId && (
                        <button
                            onClick={() => handleAction('reset')}
                            disabled={loading}
                            className='w-full px-4 py-3 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors'
                        >
                            {loading ?
                                'Processing...'
                            :   '🔄 Reset Current Session'}
                        </button>
                    )}
                </div>
            </div>

            {/* Phase Control */}
            {sessionId && (
                <div className='bg-gray-800 rounded-lg p-6 shadow-lg'>
                    <h2 className='text-xl font-semibold mb-4 text-primary-400'>
                        Phase Control
                    </h2>
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                        {[
                            {
                                phase: 'WITNESS_1',
                                label: 'Start Witness 1',
                                emoji: '👤',
                            },
                            {
                                phase: 'WITNESS_2',
                                label: 'Start Witness 2',
                                emoji: '👥',
                            },
                            {
                                phase: 'DELIBERATION',
                                label: 'Start Deliberation',
                                emoji: '⚖️',
                            },
                            {
                                phase: 'VERDICT',
                                label: 'Start Verdict',
                                emoji: '📜',
                            },
                        ].map(({ phase, label, emoji }) => (
                            <button
                                key={phase}
                                onClick={() =>
                                    handleAction('advance-phase', {
                                        targetPhase: phase,
                                    })
                                }
                                disabled={loading}
                                className='px-4 py-3 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors text-left'
                            >
                                <span className='mr-2'>{emoji}</span>
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Statement Injection */}
            {sessionId && (
                <div className='bg-gray-800 rounded-lg p-6 shadow-lg'>
                    <h2 className='text-xl font-semibold mb-4 text-primary-400'>
                        Inject Statement
                    </h2>
                    <form
                        onSubmit={e => {
                            e.preventDefault();
                            const formData = new FormData(e.currentTarget);
                            const speaker = formData.get('speaker') as string;
                            const content = formData.get('content') as string;
                            handleAction('inject-statement', {
                                speaker,
                                content,
                            });
                            e.currentTarget.reset();
                        }}
                    >
                        <div className='space-y-3'>
                            <div>
                                <label
                                    htmlFor='speaker'
                                    className='block text-sm font-medium text-gray-300 mb-1'
                                >
                                    Speaker
                                </label>
                                <select
                                    id='speaker'
                                    name='speaker'
                                    required
                                    className='w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500'
                                >
                                    <option value='JUDGE'>Judge</option>
                                    <option value='WITNESS_1'>Witness 1</option>
                                    <option value='WITNESS_2'>Witness 2</option>
                                    <option value='NARRATOR'>Narrator</option>
                                </select>
                            </div>
                            <div>
                                <label
                                    htmlFor='content'
                                    className='block text-sm font-medium text-gray-300 mb-1'
                                >
                                    Content
                                </label>
                                <textarea
                                    id='content'
                                    name='content'
                                    required
                                    rows={3}
                                    className='w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500'
                                    placeholder='Enter statement content...'
                                />
                            </div>
                            <button
                                type='submit'
                                disabled={loading}
                                className='w-full px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors'
                            >
                                {loading ?
                                    'Injecting...'
                                :   '💉 Inject Statement'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Emergency Controls */}
            {sessionId && (
                <div className='bg-gray-800 rounded-lg p-6 shadow-lg border-2 border-red-700'>
                    <h2 className='text-xl font-semibold mb-4 text-red-400'>
                        ⚠️ Emergency Controls
                    </h2>
                    <div className='space-y-3'>
                        <button
                            onClick={() => handleAction('pause')}
                            disabled={loading}
                            className='w-full px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors'
                        >
                            {loading ? 'Processing...' : '⏸️ Pause Session'}
                        </button>
                        <button
                            onClick={() => handleAction('terminate')}
                            disabled={loading}
                            className='w-full px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors'
                        >
                            {loading ? 'Processing...' : '🛑 Terminate Session'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
