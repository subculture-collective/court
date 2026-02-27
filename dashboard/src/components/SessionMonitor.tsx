import React, { useState, useEffect } from 'react';
import type { CourtEvent, SessionSnapshot, TranscriptEntry } from '../types';

interface SessionMonitorProps {
    events: CourtEvent[];
    sessionId: string | null;
}

export function SessionMonitor({ events, sessionId }: SessionMonitorProps) {
    const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!sessionId) return;

        fetch(`/api/court/sessions/${sessionId}`)
            .then(res => {
                if (!res.ok) throw new Error(`Status ${res.status}`);
                return res.json();
            })
            .then(data => {
                const s = data.session;
                if (!s) return;
                setSnapshot({
                    sessionId: s.id,
                    phase: s.phase,
                    transcript: (s.turns ?? []).map((t: any) => ({
                        speaker: t.speaker,
                        content: t.dialogue,
                        timestamp: t.createdAt,
                        isRecap: s.metadata?.recapTurnIds?.includes(t.id),
                    })),
                    votes: {
                        verdict: {
                            guilty:
                                s.metadata?.verdictVotes?.guilty ?? 0,
                            innocent:
                                s.metadata?.verdictVotes?.not_guilty ??
                                s.metadata?.verdictVotes?.not_liable ??
                                0,
                            total: Object.values(
                                s.metadata?.verdictVotes ?? {},
                            ).reduce((a: number, b) => a + (b as number), 0),
                        },
                    },
                    recapCount: (s.metadata?.recapTurnIds ?? []).length,
                    witnessCaps: { witness1: 0, witness2: 0 },
                    config: { maxWitnessStatements: 3, recapInterval: 2 },
                });
                setLoading(false);
            })
            .catch(err => {
                console.error('Failed to fetch snapshot:', err);
                setLoading(false);
            });
    }, [sessionId, events.length]);

    if (loading) {
        return (
            <div className='flex items-center justify-center py-12'>
                <div className='text-gray-400'>Loading session data...</div>
            </div>
        );
    }

    if (!snapshot) {
        return (
            <div className='bg-gray-800 rounded-lg p-8 text-center'>
                <p className='text-gray-400 text-lg'>No active session</p>
                <p className='text-gray-500 text-sm mt-2'>
                    Start a new session to begin monitoring
                </p>
            </div>
        );
    }

    const latestEvents = events.slice(-10).reverse();

    return (
        <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
            {/* Session Info */}
            <div className='bg-gray-800 rounded-lg p-6 shadow-lg'>
                <h2 className='text-xl font-semibold mb-4 text-primary-400'>
                    Session Info
                </h2>
                <div className='space-y-3'>
                    <div className='flex justify-between'>
                        <span className='text-gray-400'>Session ID:</span>
                        <span className='font-mono text-sm'>
                            {snapshot.sessionId.slice(0, 16)}...
                        </span>
                    </div>
                    <div className='flex justify-between'>
                        <span className='text-gray-400'>Current Phase:</span>
                        <span className='font-semibold text-primary-400'>
                            {snapshot.phase}
                        </span>
                    </div>
                    <div className='flex justify-between'>
                        <span className='text-gray-400'>
                            Transcript Entries:
                        </span>
                        <span>{snapshot.transcript.length}</span>
                    </div>
                    <div className='flex justify-between'>
                        <span className='text-gray-400'>Total Votes:</span>
                        <span>
                            {Object.values(snapshot.votes).reduce(
                                (sum, v) => sum + v.total,
                                0,
                            )}
                        </span>
                    </div>
                    <div className='flex justify-between'>
                        <span className='text-gray-400'>Recap Count:</span>
                        <span>{snapshot.recapCount}</span>
                    </div>
                </div>
            </div>

            {/* Witness Caps */}
            <div className='bg-gray-800 rounded-lg p-6 shadow-lg'>
                <h2 className='text-xl font-semibold mb-4 text-primary-400'>
                    Witness Caps
                </h2>
                <div className='space-y-4'>
                    <div>
                        <div className='flex justify-between mb-2'>
                            <span className='text-gray-400'>Witness 1</span>
                            <span className='text-sm'>
                                {snapshot.witnessCaps.witness1} /{' '}
                                {snapshot.config.maxWitnessStatements}
                            </span>
                        </div>
                        <div className='w-full bg-gray-700 rounded-full h-2.5'>
                            <div
                                className='bg-blue-500 h-2.5 rounded-full transition-all'
                                style={{
                                    width: `${(snapshot.witnessCaps.witness1 / snapshot.config.maxWitnessStatements) * 100}%`,
                                }}
                            />
                        </div>
                    </div>
                    <div>
                        <div className='flex justify-between mb-2'>
                            <span className='text-gray-400'>Witness 2</span>
                            <span className='text-sm'>
                                {snapshot.witnessCaps.witness2} /{' '}
                                {snapshot.config.maxWitnessStatements}
                            </span>
                        </div>
                        <div className='w-full bg-gray-700 rounded-full h-2.5'>
                            <div
                                className='bg-purple-500 h-2.5 rounded-full transition-all'
                                style={{
                                    width: `${(snapshot.witnessCaps.witness2 / snapshot.config.maxWitnessStatements) * 100}%`,
                                }}
                            />
                        </div>
                    </div>
                </div>
                <div className='mt-4 text-sm text-gray-400'>
                    Recap interval: every {snapshot.config.recapInterval}{' '}
                    statements
                </div>
            </div>

            {/* Vote Tallies */}
            <div className='bg-gray-800 rounded-lg p-6 shadow-lg'>
                <h2 className='text-xl font-semibold mb-4 text-primary-400'>
                    Vote Tallies
                </h2>
                <div className='space-y-4'>
                    {Object.entries(snapshot.votes).map(([phase, counts]) => (
                        <div key={phase}>
                            <div className='text-sm font-medium text-gray-300 mb-2'>
                                {phase}
                            </div>
                            <div className='grid grid-cols-2 gap-3'>
                                <div className='bg-green-900/30 border border-green-700 rounded p-3'>
                                    <div className='text-xs text-gray-400'>
                                        Innocent
                                    </div>
                                    <div className='text-2xl font-bold text-green-400'>
                                        {counts.innocent}
                                    </div>
                                </div>
                                <div className='bg-red-900/30 border border-red-700 rounded p-3'>
                                    <div className='text-xs text-gray-400'>
                                        Guilty
                                    </div>
                                    <div className='text-2xl font-bold text-red-400'>
                                        {counts.guilty}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Live Event Feed */}
            <div className='bg-gray-800 rounded-lg p-6 shadow-lg'>
                <h2 className='text-xl font-semibold mb-4 text-primary-400'>
                    Live Event Feed
                </h2>
                <div className='space-y-2 max-h-96 overflow-y-auto'>
                    {latestEvents.length === 0 ?
                        <div className='text-gray-500 text-center py-4'>
                            No recent events
                        </div>
                    :   latestEvents.map((event, idx) => (
                            <div
                                key={idx}
                                className='bg-gray-700 rounded p-3 text-sm border-l-4 border-primary-500'
                            >
                                <div className='flex justify-between items-start mb-1'>
                                    <span className='font-medium text-primary-300'>
                                        {event.type}
                                    </span>
                                    <span className='text-xs text-gray-400'>
                                        {new Date(
                                            event.at,
                                        ).toLocaleTimeString()}
                                    </span>
                                </div>
                                {event.type === 'turn' &&
                                    (event.payload.turn as any)?.speaker && (
                                        <div className='text-gray-300'>
                                            <span className='text-gray-400'>
                                                Speaker:
                                            </span>{' '}
                                            {
                                                (event.payload.turn as any)
                                                    .speaker
                                            }
                                        </div>
                                    )}
                                {event.type === 'phase_changed' &&
                                    event.payload.phase && (
                                        <div className='text-gray-300'>
                                            <span className='text-gray-400'>
                                                Phase:
                                            </span>{' '}
                                            {event.payload.phase as string}
                                        </div>
                                    )}
                            </div>
                        ))
                    }
                </div>
            </div>
        </div>
    );
}
