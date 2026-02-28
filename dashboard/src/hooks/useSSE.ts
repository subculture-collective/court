import { useEffect, useState, useCallback, useRef } from 'react';
import type { CourtEvent, SSEMessage } from '../types';

const RECONNECT_DELAY_MS = 3000;

export function useSSE(
    sessionId: string | null,
    onEvent: (event: CourtEvent) => void,
    onSnapshot?: (payload: Record<string, unknown>) => void,
) {
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const eventSourceRef = useRef<EventSource | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const connect = useCallback(() => {
        if (eventSourceRef.current || !sessionId) {
            return;
        }

        try {
            const es = new EventSource(
                `/api/court/sessions/${sessionId}/stream`,
            );
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
                }, RECONNECT_DELAY_MS);
            };

            es.onmessage = e => {
                try {
                    const msg = JSON.parse(e.data) as SSEMessage;

                    if (msg.type === 'snapshot') {
                        onSnapshot?.(msg.payload);
                        return;
                    }

                    onEvent(msg as CourtEvent);
                } catch (err) {
                    console.error('Failed to parse SSE event:', err);
                }
            };
        } catch (err) {
            console.error('Failed to create EventSource:', err);
            setError('Failed to connect to event stream');
        }
    }, [onEvent, onSnapshot, sessionId]);

    useEffect(() => {
        if (!sessionId) return;

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
    }, [connect, sessionId]);

    return { connected, error };
}
