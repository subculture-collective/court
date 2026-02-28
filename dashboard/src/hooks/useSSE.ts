import { useEffect, useState, useCallback, useRef } from 'react';
import type { CourtEvent, SSEMessage } from '../types';

const RECONNECT_BASE_MS = 3_000;
const RECONNECT_MAX_MS = 30_000;
const MAX_RETRIES = 10;

export function useSSE(
    sessionId: string | null,
    onEvent: (event: CourtEvent) => void,
    onSnapshot?: (payload: Record<string, unknown>) => void,
) {
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const eventSourceRef = useRef<EventSource | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const retriesRef = useRef(0);

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
                retriesRef.current = 0;
                console.log('SSE connected');
            };

            es.onerror = err => {
                console.error('SSE error:', err);
                setConnected(false);

                es.close();
                eventSourceRef.current = null;

                if (reconnectTimeoutRef.current) {
                    clearTimeout(reconnectTimeoutRef.current);
                }

                if (retriesRef.current >= MAX_RETRIES) {
                    setError('Connection lost. Max retries reached.');
                    return;
                }

                const delay = Math.min(
                    RECONNECT_BASE_MS * 2 ** retriesRef.current,
                    RECONNECT_MAX_MS,
                );
                retriesRef.current += 1;
                setError(`Connection lost. Reconnecting in ${Math.round(delay / 1000)}s...`);

                reconnectTimeoutRef.current = setTimeout(() => {
                    connect();
                }, delay);
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
