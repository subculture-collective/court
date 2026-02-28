import React, { useMemo } from 'react';
import type { CourtEvent, SessionSnapshot } from '../types';
import { EvidenceCard } from './EvidenceCard';
import { ObjectionCounter } from './ObjectionCounter';

interface SessionMonitorProps {
    events: CourtEvent[];
    snapshot: SessionSnapshot | null;
    loading: boolean;
}

export function SessionMonitor({
    events,
    snapshot,
    loading,
}: SessionMonitorProps) {
    const shouldComputeEventDerivatives = !loading && snapshot !== null;

    // Phase 3: Extract evidence cards from events
    const evidenceCards = useMemo(() => {
        if (!shouldComputeEventDerivatives) {
            return [];
        }

        return events
            .filter(e => e.type === 'evidence_revealed')
            .map(e => {
                const payload = e.payload as Record<string, unknown>;
                return {
                    evidenceId:
                        typeof payload.evidenceId === 'string' ?
                            payload.evidenceId
                        :   '',
                    evidenceText:
                        typeof payload.evidenceText === 'string' ?
                            payload.evidenceText
                        :   '',
                    revealedAt:
                        typeof payload.revealedAt === 'string' ?
                            payload.revealedAt
                        :   e.at,
                };
            });
    }, [events, shouldComputeEventDerivatives]);

    // Phase 3: Extract objection count from events
    const objectionCount = useMemo(() => {
        if (!shouldComputeEventDerivatives) {
            return 0;
        }

        const objectionEvents = events.filter(
            e => e.type === 'objection_count_changed',
        );
        if (objectionEvents.length === 0) return 0;
        const latest = objectionEvents[objectionEvents.length - 1];
        const payload = latest.payload as Record<string, unknown>;
        return typeof payload.count === 'number' ? payload.count : 0;
    }, [events, shouldComputeEventDerivatives]);

    const latestEvents = useMemo(
        () =>
            shouldComputeEventDerivatives ? events.slice(-10).reverse() : [],
        [events, shouldComputeEventDerivatives],
    );

    const totalVotes = useMemo(
        () =>
            snapshot ?
                Object.values(snapshot.votes).reduce(
                    (sum, voteCount) => sum + voteCount.total,
                    0,
                )
            :   0,
        [snapshot],
    );

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
                        <span>{totalVotes}</span>
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

            {/* Phase 3: Objection Counter */}
            <div className='bg-gray-800 rounded-lg p-6 shadow-lg'>
                <h2 className='text-xl font-semibold mb-4 text-primary-400'>
                    Objections
                </h2>
                <ObjectionCounter count={objectionCount} />
            </div>

            {/* Phase 3: Evidence Cards */}
            {evidenceCards.length > 0 && (
                <div className='bg-gray-800 rounded-lg p-6 shadow-lg lg:col-span-2'>
                    <h2 className='text-xl font-semibold mb-4 text-primary-400'>
                        Evidence Revealed
                    </h2>
                    <div className='space-y-4'>
                        {evidenceCards.map(card => (
                            <EvidenceCard
                                key={card.evidenceId}
                                evidenceId={card.evidenceId}
                                evidenceText={card.evidenceText}
                                revealedAt={card.revealedAt}
                            />
                        ))}
                    </div>
                </div>
            )}

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
                    :   latestEvents.map(event => {
                            const payload = event.payload as Record<
                                string,
                                unknown
                            >;
                            const turn = payload.turn as
                                | { speaker?: string }
                                | undefined;
                            return (
                                <div
                                    key={event.id}
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
                                        typeof turn?.speaker === 'string' && (
                                            <div className='text-gray-300'>
                                                <span className='text-gray-400'>
                                                    Speaker:
                                                </span>{' '}
                                                {turn.speaker}
                                            </div>
                                        )}
                                    {event.type === 'phase_changed' &&
                                        typeof payload.phase === 'string' && (
                                            <div className='text-gray-300'>
                                                <span className='text-gray-400'>
                                                    Phase:
                                                </span>{' '}
                                                {payload.phase}
                                            </div>
                                        )}
                                </div>
                            );
                        })
                    }
                </div>
            </div>
        </div>
    );
}
