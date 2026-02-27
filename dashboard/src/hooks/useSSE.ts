import { useEffect, useState, useCallback, useRef } from 'react';
import type { CourtEvent } from '../types';

export function useSSE(onEvent: (event: CourtEvent) => void) {
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const eventSourceRef = useRef<EventSource | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const connect = useCallback(() => {
        if (eventSourceRef.current) {
            return;
        }

        try {
            const es = new EventSource('/api/events');
            eventSourceRef.current = es;

            es.onopen = () => {
                setConnected(true);
                setError(null);
                console.log('SSE connected');
            };

            es.onerror = err => {
                console.error('SSE error:', err);
                setConnected(false);
                setError('Connection lost. Reconnecting...');

                // Clean up and schedule reconnect
                es.close();
                eventSourceRef.current = null;

                if (reconnectTimeoutRef.current) {
                    clearTimeout(reconnectTimeoutRef.current);
                }

                reconnectTimeoutRef.current = setTimeout(() => {
                    connect();
                }, 3000);
            };

            es.onmessage = e => {
                try {
                    const event = JSON.parse(e.data) as CourtEvent;
                    onEvent(event);
                } catch (err) {
                    console.error('Failed to parse SSE event:', err);
                }
            };
        } catch (err) {
            console.error('Failed to create EventSource:', err);
            setError('Failed to connect to event stream');
        }
    }, [onEvent]);

    useEffect(() => {
        connect();

        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
        };
    }, [connect]);

    return { connected, error };
}
