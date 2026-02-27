import { useEffect, useState } from 'react';

const ANIMATION_RESET_MS = 400;

export interface ObjectionCounterProps {
    count: number;
}

export function ObjectionCounter({ count }: ObjectionCounterProps) {
    const [prevCount, setPrevCount] = useState(count);
    const [animating, setAnimating] = useState(false);

    useEffect(() => {
        if (count !== prevCount) {
            setAnimating(true);
            setPrevCount(count);
            const timer = setTimeout(
                () => setAnimating(false),
                ANIMATION_RESET_MS,
            );
            return () => clearTimeout(timer);
        }
    }, [count, prevCount]);

    return (
        <div className='bg-gray-800 border border-gray-700 rounded-lg p-4'>
            <div className='flex items-center justify-between'>
                <div className='flex items-center gap-3'>
                    <div className='w-10 h-10 bg-red-500 rounded-full flex items-center justify-center'>
                        <span className='text-white text-lg'>⚖️</span>
                    </div>
                    <div>
                        <h3 className='text-gray-300 font-semibold text-sm'>
                            Objections
                        </h3>
                        <p className='text-gray-500 text-xs'>Session total</p>
                    </div>
                </div>
                <div
                    className={`text-4xl font-bold transition-all duration-300 ${
                        animating ?
                            'text-red-400 scale-125'
                        :   'text-red-500 scale-100'
                    }`}
                >
                    {count}
                </div>
            </div>
        </div>
    );
}
