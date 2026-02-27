import React, { useEffect, useState } from 'react';
import type { CourtEvent } from '../types';

interface ModerationQueueProps {
    events: CourtEvent[];
}

interface FlaggedItem {
    id: string;
    type: 'statement' | 'vote';
    content: string;
    speaker?: string;
    timestamp: string;
    reason: string;
    status: 'pending' | 'approved' | 'rejected';
}

export function ModerationQueue({ events }: ModerationQueueProps) {
    const [queue, setQueue] = useState<FlaggedItem[]>([]);
    const [filter, setFilter] = useState<
        'all' | 'pending' | 'approved' | 'rejected'
    >('pending');

    const handleApprove = (id: string) => {
        setQueue(prev =>
            prev.map(item =>
                item.id === id ?
                    { ...item, status: 'approved' as const }
                :   item,
            ),
        );
    };

    const handleReject = (id: string) => {
        setQueue(prev =>
            prev.map(item =>
                item.id === id ?
                    { ...item, status: 'rejected' as const }
                :   item,
            ),
        );
    };

    useEffect(() => {
        setQueue(prev => {
            const known = new Set(prev.map(item => item.id));
            const additions: FlaggedItem[] = [];

            for (const event of events) {
                if (known.has(event.id)) {
                    continue;
                }

                const payload = event.payload as Record<string, unknown>;

                if (event.type === 'moderation_action') {
                    const reasons = Array.isArray(payload.reasons) ? payload.reasons : [];
                    additions.push({
                        id: event.id,
                        type: 'statement',
                        content:
                            'Content was flagged and redacted by courtroom moderation.',
                        speaker:
                            typeof payload.speaker === 'string' ? payload.speaker : undefined,
                        timestamp: event.at,
                        reason:
                            reasons.length > 0 ?
                                reasons.map(String).join(', ')
                            :   'policy_violation',
                        status: 'pending',
                    });
                    known.add(event.id);
                }

                if (event.type === 'vote_spam_blocked') {
                    const reason =
                        typeof payload.reason === 'string' ?
                            payload.reason
                        :   'vote_spam';
                    additions.push({
                        id: event.id,
                        type: 'vote',
                        content: 'Vote submission blocked by anti-spam guard.',
                        timestamp: event.at,
                        reason,
                        status: 'pending',
                    });
                    known.add(event.id);
                }
            }

            return additions.length > 0 ? [...prev, ...additions] : prev;
        });
    }, [events]);

    const filteredQueue = queue.filter(
        item => filter === 'all' || item.status === filter,
    );

    return (
        <div className='space-y-6'>
            {/* Stats */}
            <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
                <div className='bg-gray-800 rounded-lg p-4'>
                    <div className='text-sm text-gray-400'>Total</div>
                    <div className='text-2xl font-bold'>{queue.length}</div>
                </div>
                <div className='bg-yellow-900/30 border border-yellow-700 rounded-lg p-4'>
                    <div className='text-sm text-gray-400'>Pending</div>
                    <div className='text-2xl font-bold text-yellow-400'>
                        {queue.filter(item => item.status === 'pending').length}
                    </div>
                </div>
                <div className='bg-green-900/30 border border-green-700 rounded-lg p-4'>
                    <div className='text-sm text-gray-400'>Approved</div>
                    <div className='text-2xl font-bold text-green-400'>
                        {
                            queue.filter(item => item.status === 'approved')
                                .length
                        }
                    </div>
                </div>
                <div className='bg-red-900/30 border border-red-700 rounded-lg p-4'>
                    <div className='text-sm text-gray-400'>Rejected</div>
                    <div className='text-2xl font-bold text-red-400'>
                        {
                            queue.filter(item => item.status === 'rejected')
                                .length
                        }
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className='flex gap-2'>
                {(['all', 'pending', 'approved', 'rejected'] as const).map(
                    status => (
                        <button
                            key={status}
                            onClick={() => setFilter(status)}
                            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                                filter === status ?
                                    'bg-primary-600 text-white'
                                :   'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            }`}
                        >
                            {status.charAt(0).toUpperCase() + status.slice(1)}
                        </button>
                    ),
                )}
            </div>

            {/* Queue */}
            <div className='bg-gray-800 rounded-lg shadow-lg'>
                {filteredQueue.length === 0 ?
                    <div className='p-8 text-center text-gray-400'>
                        {filter === 'pending' ?
                            'No pending items'
                        :   `No ${filter} items`}
                    </div>
                :   <div className='divide-y divide-gray-700'>
                        {filteredQueue.map(item => (
                            <div
                                key={item.id}
                                className='p-4 hover:bg-gray-750 transition-colors'
                            >
                                <div className='flex items-start justify-between mb-2'>
                                    <div className='flex-1'>
                                        <div className='flex items-center gap-2 mb-1'>
                                            <span
                                                className={`px-2 py-1 rounded text-xs font-medium ${
                                                    item.type === 'statement' ?
                                                        'bg-blue-900/50 text-blue-300'
                                                    :   'bg-purple-900/50 text-purple-300'
                                                }`}
                                            >
                                                {item.type}
                                            </span>
                                            {item.speaker && (
                                                <span className='text-sm text-gray-400'>
                                                    by {item.speaker}
                                                </span>
                                            )}
                                            <span className='text-xs text-gray-500'>
                                                {new Date(
                                                    item.timestamp,
                                                ).toLocaleString()}
                                            </span>
                                        </div>
                                        <p className='text-white mb-2'>
                                            {item.content}
                                        </p>
                                        <p className='text-sm text-yellow-400'>
                                            ⚠️ {item.reason}
                                        </p>
                                    </div>
                                    <div className='ml-4 flex gap-2'>
                                        {item.status === 'pending' ?
                                            <>
                                                <button
                                                    onClick={() =>
                                                        handleApprove(item.id)
                                                    }
                                                    className='px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium transition-colors'
                                                >
                                                    ✓ Approve
                                                </button>
                                                <button
                                                    onClick={() =>
                                                        handleReject(item.id)
                                                    }
                                                    className='px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition-colors'
                                                >
                                                    ✗ Reject
                                                </button>
                                            </>
                                        :   <span
                                                className={`px-3 py-1 rounded text-sm font-medium ${
                                                    item.status === 'approved' ?
                                                        'bg-green-900/50 text-green-300'
                                                    :   'bg-red-900/50 text-red-300'
                                                }`}
                                            >
                                                {item.status}
                                            </span>
                                        }
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                }
            </div>
        </div>
    );
}
