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

const usePromptHistory = (options: UsePromptHistoryOptions = {}) => {
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

export default usePromptHistory;
export type { PromptHistoryRecord } from "@/lib/promptHistory";
