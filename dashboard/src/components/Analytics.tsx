import React, { useMemo } from 'react';
import type { CourtEvent } from '../types';

interface AnalyticsProps {
    events: CourtEvent[];
}

export function Analytics({ events }: AnalyticsProps) {
    const stats = useMemo(() => {
        const byType = events.reduce(
            (acc, event) => {
                acc[event.type] = (acc[event.type] || 0) + 1;
                return acc;
            },
            {} as Record<string, number>,
        );

        const byPhase = events
            .filter(e => e.phase)
            .reduce(
                (acc, event) => {
                    acc[event.phase!] = (acc[event.phase!] || 0) + 1;
                    return acc;
                },
                {} as Record<string, number>,
            );

        const votes = events.filter(e => e.type === 'VOTE_CAST');
        const statements = events.filter(e => e.type === 'STATEMENT_COMPLETE');
        const recaps = events.filter(e => e.type === 'RECAP_GENERATED');

        return {
            total: events.length,
            byType,
            byPhase,
            votes: votes.length,
            statements: statements.length,
            recaps: recaps.length,
        };
    }, [events]);

    return (
        <div className='space-y-6'>
            {/* Summary Stats */}
            <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
                <div className='bg-gray-800 rounded-lg p-6'>
                    <div className='text-sm text-gray-400'>Total Events</div>
                    <div className='text-3xl font-bold text-primary-400'>
                        {stats.total}
                    </div>
                </div>
                <div className='bg-gray-800 rounded-lg p-6'>
                    <div className='text-sm text-gray-400'>Statements</div>
                    <div className='text-3xl font-bold text-blue-400'>
                        {stats.statements}
                    </div>
                </div>
                <div className='bg-gray-800 rounded-lg p-6'>
                    <div className='text-sm text-gray-400'>Votes</div>
                    <div className='text-3xl font-bold text-green-400'>
                        {stats.votes}
                    </div>
                </div>
                <div className='bg-gray-800 rounded-lg p-6'>
                    <div className='text-sm text-gray-400'>Recaps</div>
                    <div className='text-3xl font-bold text-purple-400'>
                        {stats.recaps}
                    </div>
                </div>
            </div>

            {/* Events by Type */}
            <div className='bg-gray-800 rounded-lg p-6 shadow-lg'>
                <h2 className='text-xl font-semibold mb-4 text-primary-400'>
                    Events by Type
                </h2>
                <div className='space-y-2'>
                    {Object.entries(stats.byType)
                        .sort(([, a], [, b]) => b - a)
                        .map(([type, count]) => (
                            <div key={type} className='flex items-center gap-3'>
                                <div className='flex-1'>
                                    <div className='flex justify-between mb-1'>
                                        <span className='text-sm font-medium text-gray-300'>
                                            {type}
                                        </span>
                                        <span className='text-sm text-gray-400'>
                                            {count}
                                        </span>
                                    </div>
                                    <div className='w-full bg-gray-700 rounded-full h-2'>
                                        <div
                                            className='bg-primary-500 h-2 rounded-full transition-all'
                                            style={{
                                                width: `${(count / stats.total) * 100}%`,
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                </div>
            </div>

            {/* Events by Phase */}
            <div className='bg-gray-800 rounded-lg p-6 shadow-lg'>
                <h2 className='text-xl font-semibold mb-4 text-primary-400'>
                    Events by Phase
                </h2>
                {Object.keys(stats.byPhase).length === 0 ?
                    <div className='text-gray-500 text-center py-4'>
                        No phase data available
                    </div>
                :   <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                        {Object.entries(stats.byPhase)
                            .sort(([, a], [, b]) => b - a)
                            .map(([phase, count]) => (
                                <div
                                    key={phase}
                                    className='bg-gray-700 rounded-lg p-4'
                                >
                                    <div className='text-sm text-gray-400'>
                                        {phase}
                                    </div>
                                    <div className='text-2xl font-bold text-primary-400'>
                                        {count}
                                    </div>
                                    <div className='text-xs text-gray-500 mt-1'>
                                        {((count / stats.total) * 100).toFixed(
                                            1,
                                        )}
                                        % of all events
                                    </div>
                                </div>
                            ))}
                    </div>
                }
            </div>

            {/* Timeline */}
            <div className='bg-gray-800 rounded-lg p-6 shadow-lg'>
                <h2 className='text-xl font-semibold mb-4 text-primary-400'>
                    Event Timeline
                </h2>
                <div className='space-y-1 max-h-96 overflow-y-auto'>
                    {events.length === 0 ?
                        <div className='text-gray-500 text-center py-4'>
                            No events recorded
                        </div>
                    :   events
                            .slice(-50)
                            .reverse()
                            .map((event, idx) => (
                                <div
                                    key={idx}
                                    className='flex items-center gap-3 py-2 px-3 hover:bg-gray-700 rounded transition-colors'
                                >
                                    <div className='text-xs text-gray-500 font-mono w-20'>
                                        {new Date(
                                            event.timestamp,
                                        ).toLocaleTimeString()}
                                    </div>
                                    <div className='flex-1'>
                                        <span className='text-sm font-medium text-primary-300'>
                                            {event.type}
                                        </span>
                                        {event.phase && (
                                            <span className='ml-2 text-xs text-gray-400'>
                                                ({event.phase})
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))
                    }
                </div>
            </div>
        </div>
    );
}
