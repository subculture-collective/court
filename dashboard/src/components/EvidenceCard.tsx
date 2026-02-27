import { useEffect, useState } from 'react';

export interface EvidenceCardProps {
    evidenceId: string;
    evidenceText: string;
    revealedAt: string;
}

export function EvidenceCard({
    evidenceId,
    evidenceText,
    revealedAt,
}: EvidenceCardProps) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        // Trigger fade-in animation on mount
        const timer = setTimeout(() => setVisible(true), 50);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div
            className={`transition-all duration-700 ${
                visible ?
                    'opacity-100 translate-y-0'
                :   'opacity-0 translate-y-4'
            }`}
        >
            <div className='bg-gradient-to-br from-purple-900 to-indigo-900 border border-purple-500 rounded-lg p-4 shadow-lg'>
                <div className='flex items-start justify-between mb-2'>
                    <div className='flex items-center gap-2'>
                        <div className='w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center'>
                            <span className='text-white text-sm font-bold'>
                                📜
                            </span>
                        </div>
                        <h3 className='text-purple-200 font-bold text-sm'>
                            Evidence Revealed
                        </h3>
                    </div>
                    <span className='text-purple-400 text-xs'>
                        {new Date(revealedAt).toLocaleTimeString()}
                    </span>
                </div>
                <p className='text-white text-base leading-relaxed'>
                    {evidenceText}
                </p>
            </div>
        </div>
    );
}
