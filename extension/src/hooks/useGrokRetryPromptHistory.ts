import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    PROMPT_HISTORY_UPDATED_EVENT,
    PromptHistoryRecord,
    PromptHistoryStatus,
    PromptHistoryTable,
    PromptHistoryLayer,
    getPromptHistoryRecords,
    recordPromptHistoryOutcome,
    normalizePromptText,
    hashPromptText,
} from "@/lib/promptHistory";

interface UsePromptHistoryOptions {
    onRecordsChange?: (records: PromptHistoryRecord[]) => void;
}

/**
 * Manages prompt history tracking and moderation statistics.
 * 
 * Provides:
 * - Storage and retrieval of prompt history records
 * - Moderation layer tracking (Layer 1/2/3 failures per prompt)
 * - Prompt deduplication via hashing
 * - Success/failure outcome recording
 * - Configurable history limit (from global settings)
 * - Real-time updates via custom events
 * 
 * History records track:
 * - Prompt text (normalized and hashed)
 * - Attempt count and status (pending/success/moderated)
 * - Layer-specific failure counts
 * - First/last attempt timestamps
 * 
 * Storage: chrome.storage.local
 * Key: 'grok_promptHistory_v1'
 * 
 * @param options.onRecordsChange - Optional callback when records update
 * @returns Records array and function to record outcomes
 * 
 * @example
 * ```tsx
 * const { records, recordOutcome } = useGrokRetryPromptHistory();
 * 
 * // Record a moderation failure
 * recordOutcome('A prompt', 'moderated', 2); // Layer 2
 * ```
 */
const useGrokRetryPromptHistory = (options: UsePromptHistoryOptions = {}) => {
    const { onRecordsChange } = options;
    const [records, setRecords] = useState<PromptHistoryRecord[]>([]);
    const lastSeenTableRef = useRef<PromptHistoryTable | null>(null);

    const loadRecords = useCallback(async () => {
        const next = await getPromptHistoryRecords();
        setRecords(next);
        onRecordsChange?.(next);
    }, [onRecordsChange]);

    useEffect(() => {
        loadRecords();
    }, [loadRecords]);

    useEffect(() => {
        const handler = (event: Event) => {
            const detail = (event as CustomEvent<{ records: PromptHistoryTable }>).detail;
            const nextTable = detail?.records ?? null;
            if (nextTable === lastSeenTableRef.current) {
                return;
            }
            lastSeenTableRef.current = nextTable;
            loadRecords();
        };
        window.addEventListener(PROMPT_HISTORY_UPDATED_EVENT, handler);
        return () => window.removeEventListener(PROMPT_HISTORY_UPDATED_EVENT, handler);
    }, [loadRecords]);

    const recordOutcome = useCallback(
        ({ text, status, layer, timestamp }: { text: string; status: PromptHistoryStatus; layer?: PromptHistoryLayer; timestamp?: number }) => {
            const normalized = normalizePromptText(text);
            if (!normalized) {
                return;
            }
            recordPromptHistoryOutcome({
                id: hashPromptText(normalized),
                text: normalized,
                status,
                layer,
                timestamp,
            });
        },
        []
    );

    return useMemo(
        () => ({
            records,
            recordOutcome,
            reload: loadRecords,
        }),
        [records, recordOutcome, loadRecords]
    );
};

export default useGrokRetryPromptHistory;
export type { PromptHistoryRecord } from "@/lib/promptHistory";
