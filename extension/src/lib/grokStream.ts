import { useRef, useSyncExternalStore } from 'react';

export type VideoAttemptStatus = 'pending' | 'running' | 'completed' | 'moderated';

export interface VideoAttemptState {
    videoId: string;
    videoPostId: string;
    parentPostId: string | null;
    prompt: string | null;
    imageReference: string | null;
    progress: number;
    moderated: boolean;
    status: VideoAttemptStatus;
    sideBySideIndex: number | null;
    mode: string | null;
    width: number | null;
    height: number | null;
    lastUpdate: number;
}

export interface ParentSessionState {
    parentPostId: string;
    conversationId: string | null;
    prompt: string | null;
    lastUserResponseId: string | null;
    lastAssistantResponseId: string | null;
    attempts: string[];
    lastUpdate: number;
}

export type GrokStreamEvent =
    | { type: 'conversation-start'; conversationId: string; createdAt?: string }
    | {
        type: 'prompt-submitted';
        conversationId: string | null;
        parentPostId: string | null;
        responseId: string;
        prompt: string;
        createdAt?: string;
    }
    | { type: 'assistant-message'; responseId: string; parentPostId: string | null; message: string }
    | { type: 'video-progress'; attempt: VideoAttemptState };

interface GrokStreamSnapshot {
    version: number;
    parents: Record<string, ParentSessionState>;
    videos: Record<string, VideoAttemptState>;
    lastEvent: GrokStreamEvent | null;
}

interface MutationResult {
    parents?: Record<string, ParentSessionState>;
    videos?: Record<string, VideoAttemptState>;
    lastEvent?: GrokStreamEvent | null;
}

const listeners = new Set<() => void>();
let snapshot: GrokStreamSnapshot = {
    version: 0,
    parents: {},
    videos: {},
    lastEvent: null,
};

const decoder = new TextDecoder();
let interceptInstalled = false;
let baselineFetch: typeof window.fetch | null = null;

function notify() {
    for (const listener of listeners) {
        try {
            listener();
        } catch (error) {
            console.warn('[Grok Retry] Stream listener error:', error);
        }
    }
}

function mutateState(mutator: () => MutationResult | void) {
    const result = mutator();
    if (!result) {
        return;
    }
    snapshot = {
        version: snapshot.version + 1,
        parents: result.parents ?? snapshot.parents,
        videos: result.videos ?? snapshot.videos,
        lastEvent: result.lastEvent ?? snapshot.lastEvent,
    };
    notify();
}

function getParentSnapshot(parentPostId: string): ParentSessionState {
    return snapshot.parents[parentPostId] ?? {
        parentPostId,
        conversationId: null,
        prompt: null,
        lastUserResponseId: null,
        lastAssistantResponseId: null,
        attempts: [],
        lastUpdate: Date.now(),
    };
}

function recordPromptEvent(params: {
    conversationId: string | null;
    parentPostId: string | null;
    responseId: string;
    prompt: string;
    createdAt?: string;
}) {
    if (!params.parentPostId) {
        return;
    }
    const parent = getParentSnapshot(params.parentPostId);
    const updated: ParentSessionState = {
        ...parent,
        conversationId: params.conversationId ?? parent.conversationId,
        prompt: params.prompt ?? parent.prompt,
        lastUserResponseId: params.responseId,
        lastUpdate: Date.now(),
    };
    mutateState(() => ({
        parents: { ...snapshot.parents, [params.parentPostId as string]: updated },
        lastEvent: {
            type: 'prompt-submitted',
            conversationId: updated.conversationId,
            parentPostId: params.parentPostId,
            responseId: params.responseId,
            prompt: params.prompt,
            createdAt: params.createdAt,
        },
    }));
}

function recordAssistantMessage(params: {
    parentPostId: string | null;
    responseId: string;
    message: string;
}) {
    if (!params.parentPostId) {
        return;
    }
    const parent = getParentSnapshot(params.parentPostId);
    const updated: ParentSessionState = {
        ...parent,
        lastAssistantResponseId: params.responseId,
        lastUpdate: Date.now(),
    };
    mutateState(() => ({
        parents: { ...snapshot.parents, [params.parentPostId as string]: updated },
        lastEvent: {
            type: 'assistant-message',
            responseId: params.responseId,
            parentPostId: params.parentPostId,
            message: params.message,
        },
    }));
}

function recordConversationStart(conversationId: string, createdAt?: string) {
    mutateState(() => ({
        lastEvent: { type: 'conversation-start', conversationId, createdAt },
    }));
}

function statusFromProgress(progress: number, moderated: boolean): VideoAttemptStatus {
    if (moderated) {
        return 'moderated';
    }
    if (progress >= 100) {
        return 'completed';
    }
    if (progress > 0) {
        return 'running';
    }
    return 'pending';
}

function recordVideoProgress(payload: {
    videoId?: string | null;
    videoPostId?: string | null;
    parentPostId?: string | null;
    prompt?: string | null;
    imageReference?: string | null;
    progress?: number | null;
    moderated?: boolean | null;
    sideBySideIndex?: number | null;
    mode?: string | null;
    width?: number | null;
    height?: number | null;
}) {
    const videoPostId = payload.videoPostId ?? payload.videoId;
    if (!videoPostId) {
        return;
    }

    const existing = snapshot.videos[videoPostId];
    const progress = typeof payload.progress === 'number' ? payload.progress : existing?.progress ?? 0;
    const moderated = typeof payload.moderated === 'boolean' ? payload.moderated : existing?.moderated ?? false;
    const now = Date.now();
    const attempt: VideoAttemptState = {
        videoId: payload.videoId ?? existing?.videoId ?? videoPostId,
        videoPostId,
        parentPostId: payload.parentPostId ?? existing?.parentPostId ?? null,
        prompt: payload.prompt ?? existing?.prompt ?? null,
        imageReference: payload.imageReference ?? existing?.imageReference ?? null,
        progress,
        moderated,
        status: statusFromProgress(progress, moderated),
        sideBySideIndex: payload.sideBySideIndex ?? existing?.sideBySideIndex ?? null,
        mode: payload.mode ?? existing?.mode ?? null,
        width: payload.width ?? existing?.width ?? null,
        height: payload.height ?? existing?.height ?? null,
        lastUpdate: now,
    };

    const videos = { ...snapshot.videos, [videoPostId]: attempt };
    let parents = snapshot.parents;

    if (attempt.parentPostId) {
        const parentId = attempt.parentPostId;
        const parent = getParentSnapshot(parentId);
        const attempts = parent.attempts.includes(videoPostId)
            ? parent.attempts
            : [...parent.attempts, videoPostId];
        const updatedParent: ParentSessionState = {
            ...parent,
            attempts,
            lastUpdate: now,
        };
        parents = { ...snapshot.parents, [parentId]: updatedParent };
    }

    mutateState(() => ({
        videos,
        parents,
        lastEvent: { type: 'video-progress', attempt },
    }));
}

function parseParentPostIdFromMetadata(metadata: any): string | null {
    const override = metadata?.modelConfigOverride?.modelMap?.videoGenModelConfig;
    if (override?.parentPostId && typeof override.parentPostId === 'string') {
        return override.parentPostId;
    }
    return null;
}

function parsePayloadObject(raw: string) {
    try {
        return JSON.parse(raw);
    } catch (error) {
        console.warn('[Grok Retry] Failed to parse stream chunk:', error, raw);
        return null;
    }
}

function processParsedPayload(payload: any) {
    const result = payload?.result;
    if (!result) {
        return;
    }

    if (result.conversation && typeof result.conversation.conversationId === 'string') {
        recordConversationStart(result.conversation.conversationId, result.conversation.createTime);
    }

    const response = result.response;
    if (response?.userResponse) {
        const user = response.userResponse;
        const parentPostId = parseParentPostIdFromMetadata(user.metadata) ?? null;
        recordPromptEvent({
            conversationId: result.conversation?.conversationId ?? null,
            parentPostId,
            responseId: user.responseId,
            prompt: user.message ?? '',
            createdAt: user.createTime,
        });
    }

    if (response?.modelResponse) {
        const parentPostId = parseParentPostIdFromMetadata(response.modelResponse.metadata) ?? null;
        recordAssistantMessage({
            parentPostId,
            responseId: response.modelResponse.responseId,
            message: response.modelResponse.message ?? '',
        });
    }

    if (response?.streamingVideoGenerationResponse) {
        const data = response.streamingVideoGenerationResponse;
        recordVideoProgress({
            videoId: data.videoId ?? null,
            videoPostId: data.videoPostId ?? null,
            parentPostId: data.parentPostId ?? null,
            prompt: data.videoPrompt ?? null,
            imageReference: data.imageReference ?? null,
            progress: typeof data.progress === 'number' ? data.progress : null,
            moderated: typeof data.moderated === 'boolean' ? data.moderated : null,
            sideBySideIndex: typeof data.sideBySideIndex === 'number' ? data.sideBySideIndex : null,
            mode: typeof data.mode === 'string' ? data.mode : null,
            width: typeof data.width === 'number' ? data.width : null,
            height: typeof data.height === 'number' ? data.height : null,
        });
    }
}

async function processStreamingResponse(response: Response) {
    const reader = response.body?.getReader();
    if (!reader) {
        return;
    }

    let buffer = '';
    let inString = false;
    let escapeNext = false;
    let braceDepth = 0;
    const flushBuffer = (isFinal = false) => {
        if (!buffer) {
            return;
        }
        let startIndex = 0;
        inString = false;
        escapeNext = false;
        braceDepth = 0;
        for (let i = 0; i < buffer.length; i++) {
            const char = buffer[i];
            if (escapeNext) {
                escapeNext = false;
                continue;
            }
            if (char === '\\') {
                escapeNext = true;
                continue;
            }
            if (char === '"') {
                inString = !inString;
                continue;
            }
            if (inString) {
                continue;
            }
            if (char === '{') {
                if (braceDepth === 0) {
                    startIndex = i;
                }
                braceDepth++;
            } else if (char === '}') {
                braceDepth--;
                if (braceDepth === 0) {
                    const jsonChunk = buffer.slice(startIndex, i + 1).trim();
                    if (jsonChunk) {
                        const parsed = parsePayloadObject(jsonChunk);
                        if (parsed) {
                            processParsedPayload(parsed);
                        }
                    }
                }
            }
        }
        if (braceDepth > 0 && !isFinal) {
            buffer = buffer.slice(startIndex);
        } else {
            buffer = '';
        }
    };

    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                break;
            }
            if (!value) {
                continue;
            }
            buffer += decoder.decode(value, { stream: true });
            flushBuffer();
        }
        buffer += decoder.decode();
        flushBuffer(true);
    } catch (error) {
        console.warn('[Grok Retry] Failed to process Grok stream:', error);
    }
}

function shouldIntercept(input: RequestInfo | URL): string | null {
    try {
        if (typeof input === 'string') {
            return (input.includes('/rest/app-chat/conversations/new') || input.includes('/rest/media/post/list')) ? input : null;
        }
        if (input instanceof URL) {
            return (input.href.includes('/rest/app-chat/conversations/new') || input.href.includes('/rest/media/post/list')) ? input.href : null;
        }
        if (typeof Request !== 'undefined' && input instanceof Request) {
            return (input.url.includes('/rest/app-chat/conversations/new') || input.url.includes('/rest/media/post/list')) ? input.url : null;
        }
    } catch {
        // ignore
    }
    return null;
}

export function installGrokStreamInterceptor() {
    if (interceptInstalled || typeof window === 'undefined' || !window.fetch) {
        return;
    }
    interceptInstalled = true;
    if (!baselineFetch) {
        baselineFetch = window.fetch;
    }
    const originalFetch = baselineFetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const response = await originalFetch.call(window, input as any, init);
        try {
            const url = shouldIntercept(input);
            if (url && response?.body) {
                // For streaming responses (chat), process as stream
                if (url.includes('/rest/app-chat/conversations/new')) {
                    processStreamingResponse(response.clone());
                }
                // For media post list (video status polling), process as JSON
                else if (url.includes('/rest/media/post/list')) {
                    processMediaPostListResponse(response.clone());
                }
            }
        } catch (error) {
            console.warn('[Grok Retry] Failed to intercept Grok stream:', error);
        }
        return response;
    };
}

async function processMediaPostListResponse(response: Response) {
    try {
        const data = await response.json();
        if (data?.posts && Array.isArray(data.posts)) {
            for (const post of data.posts) {
                if (post.type === 'VIDEO' && post.postId) {
                    const progress = post.metadata?.progress ?? (post.videoUrl ? 100 : 0);
                    const moderated = post.moderated === true;
                    recordVideoProgress({
                        videoPostId: post.postId,
                        videoId: post.videoId ?? post.postId,
                        parentPostId: post.metadata?.parentPostId ?? null,
                        prompt: post.metadata?.videoPrompt ?? null,
                        imageReference: post.metadata?.imageReference ?? null,
                        progress,
                        moderated,
                        mode: post.metadata?.mode ?? null,
                        width: post.metadata?.width ?? null,
                        height: post.metadata?.height ?? null,
                        sideBySideIndex: post.metadata?.sideBySideIndex ?? null,
                    });
                }
            }
        }
    } catch (error) {
        console.warn('[Grok Retry] Failed to process media post list response:', error);
    }
}

export function subscribeGrokStream(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function getGrokStreamSnapshot(): GrokStreamSnapshot {
    return snapshot;
}

export function useGrokStreamSelector<T>(selector: (state: GrokStreamSnapshot) => T): T {
    const selectorRef = useRef(selector);
    selectorRef.current = selector;
    const getSnapshot = () => selectorRef.current(snapshot);
    return useSyncExternalStore(subscribeGrokStream, getSnapshot, getSnapshot);
}

export function useGrokParentSession(parentPostId: string | null | undefined): ParentSessionState | undefined {
    return useGrokStreamSelector((state) => {
        if (!parentPostId) {
            return undefined;
        }
        return state.parents[parentPostId];
    });
}

export function useGrokVideoAttempt(videoPostId: string | null | undefined): VideoAttemptState | undefined {
    return useGrokStreamSelector((state) => {
        if (!videoPostId) {
            return undefined;
        }
        return state.videos[videoPostId];
    });
}

export function useLatestAttemptForParent(parentPostId: string | null | undefined): VideoAttemptState | undefined {
    return useGrokStreamSelector((state) => {
        if (!parentPostId) {
            return undefined;
        }
        const parent = state.parents[parentPostId];
        if (!parent) {
            return undefined;
        }
        for (let index = parent.attempts.length - 1; index >= 0; index -= 1) {
            const attemptId = parent.attempts[index];
            const attempt = state.videos[attemptId];
            if (attempt) {
                return attempt;
            }
        }
        return undefined;
    });
}

export function getLatestAttemptForParent(parentPostId: string | null | undefined): VideoAttemptState | undefined {
    if (!parentPostId) {
        return undefined;
    }
    const parent = snapshot.parents[parentPostId];
    if (!parent) {
        return undefined;
    }
    for (let i = parent.attempts.length - 1; i >= 0; i -= 1) {
        const attemptId = parent.attempts[i];
        const attempt = snapshot.videos[attemptId];
        if (attempt) {
            return attempt;
        }
    }
    return undefined;
}

export function ingestGrokStreamPayload(payload: unknown) {
    processParsedPayload(payload);
}

export function resetGrokStreamStateForTests() {
    snapshot = {
        version: 0,
        parents: {},
        videos: {},
        lastEvent: null,
    };
    listeners.clear();
    if (typeof window !== 'undefined' && baselineFetch) {
        window.fetch = baselineFetch;
    }
    interceptInstalled = false;
    baselineFetch = null;
}
