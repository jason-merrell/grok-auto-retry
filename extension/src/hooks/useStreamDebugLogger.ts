import { useEffect, useRef } from 'react';
import { subscribeGrokStream, getGrokStreamSnapshot, type GrokStreamEvent } from '../lib/grokStream';

interface StreamDebugLoggerOptions {
    enabled: boolean;
    logToConsole?: boolean;
    logToWindow?: boolean;
}

/**
 * Debug utility that logs all stream events to help validate stream-based detection
 * Usage:
 *   useStreamDebugLogger({ enabled: true, logToConsole: true, logToWindow: true })
 * 
 * When logToWindow is enabled, events are stored in window.__grok_stream_events
 * for inspection in DevTools or automated tests
 */
export const useStreamDebugLogger = ({
    enabled,
    logToConsole = true,
    logToWindow = false,
}: StreamDebugLoggerOptions) => {
    const eventCountRef = useRef<number>(0);
    const lastEventRef = useRef<GrokStreamEvent | null>(null);

    useEffect(() => {
        if (!enabled) {
            return;
        }

        if (logToWindow) {
            (window as any).__grok_stream_events = [];
        }

        const unsubscribe = subscribeGrokStream(() => {
            const snapshot = getGrokStreamSnapshot();
            const event = snapshot.lastEvent;

            if (!event || event === lastEventRef.current) {
                return;
            }

            lastEventRef.current = event;
            eventCountRef.current++;

            const logEntry = {
                timestamp: new Date().toISOString(),
                eventNumber: eventCountRef.current,
                event,
                snapshot: {
                    version: snapshot.version,
                    parentCount: Object.keys(snapshot.parents).length,
                    videoCount: Object.keys(snapshot.videos).length,
                },
            };

            if (logToConsole) {
                console.log('[Grok Stream Debug]', logEntry);
            }

            if (logToWindow) {
                const events = (window as any).__grok_stream_events || [];
                events.push(logEntry);
                (window as any).__grok_stream_events = events;
            }

            // Log specific event details based on type
            if (logToConsole) {
                switch (event.type) {
                    case 'conversation-start':
                        console.log('[Grok Stream] Conversation started:', event.conversationId);
                        break;
                    case 'prompt-submitted':
                        console.log('[Grok Stream] Prompt submitted:', {
                            parentPostId: event.parentPostId,
                            prompt: event.prompt?.substring(0, 50) + '...',
                        });
                        break;
                    case 'assistant-message':
                        console.log('[Grok Stream] Assistant message:', {
                            responseId: event.responseId,
                            message: event.message?.substring(0, 50) + '...',
                        });
                        break;
                    case 'video-progress':
                        console.log('[Grok Stream] Video progress:', {
                            videoPostId: event.attempt.videoPostId,
                            progress: event.attempt.progress,
                            status: event.attempt.status,
                            moderated: event.attempt.moderated,
                        });
                        break;
                }
            }
        });

        return () => {
            unsubscribe();
            if (logToWindow) {
                delete (window as any).__grok_stream_events;
            }
        };
    }, [enabled, logToConsole, logToWindow]);

    return {
        eventCount: eventCountRef.current,
        lastEvent: lastEventRef.current,
    };
};

/**
 * Helper function to install stream event logger globally
 * Call this from DevTools console to start logging:
 *   installStreamLogger()
 */
if (typeof window !== 'undefined') {
    (window as any).installStreamLogger = () => {
        console.log('[Grok Stream] Installing debug logger...');
        (window as any).__grok_stream_events = [];
        (window as any).__grok_stream_debug_enabled = true;

        const unsubscribe = subscribeGrokStream(() => {
            const snapshot = getGrokStreamSnapshot();
            const event = snapshot.lastEvent;

            if (!event) {
                return;
            }

            const events = (window as any).__grok_stream_events || [];
            events.push({
                timestamp: new Date().toISOString(),
                eventNumber: events.length + 1,
                event,
                snapshot: {
                    version: snapshot.version,
                    parentCount: Object.keys(snapshot.parents).length,
                    videoCount: Object.keys(snapshot.videos).length,
                },
            });
            (window as any).__grok_stream_events = events;

            console.log('[Grok Stream]', event.type, event);
        });

        (window as any).uninstallStreamLogger = () => {
            console.log('[Grok Stream] Uninstalling debug logger...');
            unsubscribe();
            delete (window as any).__grok_stream_debug_enabled;
        };

        console.log('[Grok Stream] Debug logger installed. Events will be stored in window.__grok_stream_events');
        console.log('[Grok Stream] To uninstall: uninstallStreamLogger()');
    };
}
