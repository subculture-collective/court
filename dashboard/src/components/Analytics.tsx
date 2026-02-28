import React, { useMemo } from 'react';
import type { CourtEvent } from '../types';

interface AnalyticsProps {
    events: CourtEvent[];
}

export function Analytics({ events }: AnalyticsProps) {
    const stats = useMemo(() => {
        const byType: Record<string, number> = {};
        const byPhase: Record<string, number> = {};
        let votes = 0;
        let statements = 0;
        let recaps = 0;
        let tokenBudgetApplied = 0;
        let latestEstimatedTokens = 0;
        let latestEstimatedCostUsd = 0;

        for (const event of events) {
            byType[event.type] = (byType[event.type] || 0) + 1;

            if (event.type === 'phase_changed') {
                const phase =
                    typeof event.payload.phase === 'string' ?
                        event.payload.phase
                    :   '';
                if (phase) {
                    byPhase[phase] = (byPhase[phase] || 0) + 1;
                }
            }

            if (event.type === 'vote_updated') {
                votes += 1;
            }

            if (event.type === 'turn') {
                statements += 1;
            }

            if (event.type === 'judge_recap_emitted') {
                recaps += 1;
            }

            if (event.type === 'token_budget_applied') {
                tokenBudgetApplied += 1;
            }

            if (event.type === 'session_token_estimate') {
                if (
                    typeof event.payload.cumulativeEstimatedTokens === 'number'
                ) {
                    latestEstimatedTokens =
                        event.payload.cumulativeEstimatedTokens;
                }

                if (typeof event.payload.estimatedCostUsd === 'number') {
                    latestEstimatedCostUsd = event.payload.estimatedCostUsd;
                }
            }
        }

        const sortedByType = Object.entries(byType).sort(
            ([, leftCount], [, rightCount]) => rightCount - leftCount,
        );

        const sortedByPhase = Object.entries(byPhase).sort(
            ([, leftCount], [, rightCount]) => rightCount - leftCount,
        );

        return {
            total: events.length,
            byType: sortedByType,
            byPhase: sortedByPhase,
            votes,
            statements,
            recaps,
            tokenBudgetApplied,
            latestEstimatedTokens,
            latestEstimatedCostUsd,
            recentEvents: events.slice(-50).reverse(),
        };
    }, [events]);

    return (
        <div className='space-y-6'>
            {/* Summary Stats */}
            <div className='grid grid-cols-1 md:grid-cols-6 gap-4'>
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
                <div className='bg-gray-800 rounded-lg p-6'>
                    <div className='text-sm text-gray-400'>Token Caps</div>
                    <div className='text-3xl font-bold text-amber-400'>
                        {stats.tokenBudgetApplied}
                    </div>
                </div>
                <div className='bg-gray-800 rounded-lg p-6'>
                    <div className='text-sm text-gray-400'>Est. Cost (USD)</div>
                    <div className='text-3xl font-bold text-emerald-400'>
                        ${stats.latestEstimatedCostUsd.toFixed(4)}
                    </div>
                    <div className='text-xs text-gray-500 mt-1'>
                        ~{stats.latestEstimatedTokens} tokens
                    </div>
                </div>
            </div>

            {/* Events by Type */}
            <div className='bg-gray-800 rounded-lg p-6 shadow-lg'>
                <h2 className='text-xl font-semibold mb-4 text-primary-400'>
                    Events by Type
                </h2>
                <div className='space-y-2'>
                    {stats.byType.map(([type, count]) => (
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
                                            width: `${(count / Math.max(stats.total, 1)) * 100}%`,
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
                {stats.byPhase.length === 0 ?
                    <div className='text-gray-500 text-center py-4'>
                        No phase data available
                    </div>
                :   <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                        {stats.byPhase.map(([phase, count]) => (
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
                                    {(
                                        (count / Math.max(stats.total, 1)) *
                                        100
                                    ).toFixed(1)}
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
                    {stats.total === 0 ?
                        <div className='text-gray-500 text-center py-4'>
                            No events recorded
                        </div>
                    :   stats.recentEvents.map(event => (
                            <div
                                key={event.id}
                                className='flex items-center gap-3 py-2 px-3 hover:bg-gray-700 rounded transition-colors'
                            >
                                <div className='text-xs text-gray-500 font-mono w-20'>
                                    {new Date(event.at).toLocaleTimeString()}
                                </div>
                                <div className='flex-1'>
                                    <span className='text-sm font-medium text-primary-300'>
                                        {event.type}
                                    </span>
                                    {event.type === 'phase_changed' &&
                                        event.payload.phase && (
                                            <span className='ml-2 text-xs text-gray-400'>
                                                ({event.payload.phase as string}
                                                )
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
