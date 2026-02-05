import { nanoid } from 'nanoid';

export type PromptHistoryLayer = 1 | 2 | 3 | null | undefined;

export interface PromptHistoryRecord {
    id: string;
    text: string;
    lastExecuted: number;
    executionsAmount: number;
    successAmount: number;
    l1FailureAmount: number;
    l2FailureAmount: number;
    l3FailureAmount: number;
    lastOutcome: PromptHistoryStatus | null;
    lastLayer: PromptHistoryLayer | null;
}

export type PromptHistoryStatus = "success" | "failure";

export interface PromptHistoryUpdate {
    id?: string;
    text: string;
    status: PromptHistoryStatus;
    layer?: PromptHistoryLayer;
    timestamp?: number;
}

export type PromptHistoryTable = Record<string, PromptHistoryRecord>;

export const PROMPT_HISTORY_STORAGE_KEY = "useGrokRetryPromptHistory";
export const PROMPT_HISTORY_UPDATED_EVENT = "grok:promptHistoryUpdated";

const GLOBAL_SETTINGS_STORAGE_KEY = "useGrokRetrySettings_store";
const PROMPT_HISTORY_LIMIT_DEFAULT = 30;
const PROMPT_HISTORY_LIMIT_MIN = 1;
const PROMPT_HISTORY_LIMIT_MAX = 200;

let promptHistoryWriteQueue: Promise<void> = Promise.resolve();

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export const normalizePromptText = (input: string): string => {
    return input
        .replace(/\s+/g, " ")
        .replace(/\s+([.,!?;:])/g, "$1")
        .trim();
};

export const hashPromptText = (input: string): string => {
    let hash1 = FNV_OFFSET;
    let hash2 = FNV_OFFSET;
    for (let i = 0; i < input.length; i += 1) {
        const code = input.charCodeAt(i);
        hash1 ^= code;
        hash1 = Math.imul(hash1, FNV_PRIME);
        hash2 ^= code << 8;
        hash2 = Math.imul(hash2, FNV_PRIME);
    }
    const combined = (BigInt(hash1 >>> 0) << 32n) ^ BigInt(hash2 >>> 0) ^ BigInt(input.length);
    return combined.toString(16).padStart(16, "0");
};

export const createPromptHistoryRecord = (base: Partial<PromptHistoryRecord> & { id: string; text: string }): PromptHistoryRecord => ({
    id: base.id,
    text: base.text,
    lastExecuted: base.lastExecuted ?? 0,
    executionsAmount: base.executionsAmount ?? 0,
    successAmount: base.successAmount ?? 0,
    l1FailureAmount: base.l1FailureAmount ?? 0,
    l2FailureAmount: base.l2FailureAmount ?? 0,
    l3FailureAmount: base.l3FailureAmount ?? 0,
    lastOutcome: base.lastOutcome ?? null,
    lastLayer: base.lastLayer ?? null,
});

export const loadPromptHistory = (): Promise<PromptHistoryTable> => {
    return new Promise((resolve) => {
        if (typeof chrome === "undefined" || !chrome.storage?.local) {
            resolve({});
            return;
        }
        chrome.storage.local.get([PROMPT_HISTORY_STORAGE_KEY], (result) => {
            const table = (result?.[PROMPT_HISTORY_STORAGE_KEY] ?? {}) as PromptHistoryTable;
            resolve(table);
        });
    });
};

const clonePromptHistoryTable = (table: PromptHistoryTable): PromptHistoryTable => {
    const clone: PromptHistoryTable = {};
    for (const [key, record] of Object.entries(table)) {
        clone[key] = { ...record };
    }
    return clone;
};

const emitPromptHistoryUpdate = (records: PromptHistoryTable) => {
    try {
        window.dispatchEvent(
            new CustomEvent(PROMPT_HISTORY_UPDATED_EVENT, {
                detail: { records },
            })
        );
    } catch {
        // noop
    }
};

const setPromptHistoryTable = (table: PromptHistoryTable, callback?: () => void) => {
    const nextTable = clonePromptHistoryTable(table);
    if (typeof chrome === "undefined" || !chrome.storage?.local) {
        emitPromptHistoryUpdate(nextTable);
        callback?.();
        return;
    }
    chrome.storage.local.set({ [PROMPT_HISTORY_STORAGE_KEY]: nextTable }, () => {
        if (chrome.runtime?.lastError) {
            console.error("[Grok Retry] Failed to persist prompt history", chrome.runtime.lastError);
        }
        emitPromptHistoryUpdate(nextTable);
        callback?.();
    });
};

const clampPromptHistoryLimit = (value: unknown): number => {
    const numeric =
        typeof value === "number"
            ? value
            : parseInt(typeof value === "string" ? value : String(value ?? PROMPT_HISTORY_LIMIT_DEFAULT), 10);

    if (!Number.isFinite(numeric)) {
        return PROMPT_HISTORY_LIMIT_DEFAULT;
    }

    return Math.max(
        PROMPT_HISTORY_LIMIT_MIN,
        Math.min(PROMPT_HISTORY_LIMIT_MAX, Math.round(numeric))
    );
};

const getPromptHistoryLimit = (): Promise<number> => {
    return new Promise((resolve) => {
        if (typeof chrome === "undefined" || !chrome.storage?.sync?.get) {
            resolve(PROMPT_HISTORY_LIMIT_DEFAULT);
            return;
        }

        chrome.storage.sync.get([GLOBAL_SETTINGS_STORAGE_KEY], (result) => {
            const settings = result?.[GLOBAL_SETTINGS_STORAGE_KEY] as { promptHistoryLimit?: unknown } | undefined;
            resolve(clampPromptHistoryLimit(settings?.promptHistoryLimit));
        });
    });
};

const prunePromptHistoryTable = (table: PromptHistoryTable, limit: number) => {
    const idsByAge = Object.values(table)
        .sort((a, b) => (a.lastExecuted ?? 0) - (b.lastExecuted ?? 0))
        .map((record) => record.id);

    const excess = idsByAge.length - limit;
    if (excess <= 0) {
        return;
    }

    for (let index = 0; index < excess; index += 1) {
        const id = idsByAge[index];
        if (id) {
            delete table[id];
        }
    }
};

export const recordPromptHistoryOutcome = (update: PromptHistoryUpdate): Promise<void> => {
    const trimmedText = normalizePromptText(update.text);
    if (!trimmedText) {
        return promptHistoryWriteQueue;
    }
    const id = update.id || hashPromptText(trimmedText);
    const scheduleUpdate = () =>
        Promise.all([loadPromptHistory(), getPromptHistoryLimit()]).then(([table, limit]) => {
            const now = update.timestamp ?? Date.now();
            const existing = table[id];
            const record = existing
                ? { ...existing }
                : createPromptHistoryRecord({ id, text: trimmedText, lastExecuted: now });
            record.text = trimmedText;
            record.lastExecuted = now;
            record.executionsAmount = (record.executionsAmount ?? 0) + 1;
            if (update.status === "success") {
                record.successAmount = (record.successAmount ?? 0) + 1;
                record.lastOutcome = "success";
                record.lastLayer = null;
            } else if (update.status === "failure") {
                switch (update.layer) {
                    case 1:
                        record.l1FailureAmount = (record.l1FailureAmount ?? 0) + 1;
                        break;
                    case 2:
                        record.l2FailureAmount = (record.l2FailureAmount ?? 0) + 1;
                        break;
                    case 3:
                        record.l3FailureAmount = (record.l3FailureAmount ?? 0) + 1;
                        break;
                    default:
                        break;
                }
                record.lastOutcome = "failure";
                record.lastLayer = update.layer ?? null;
            }
            table[id] = record;
            prunePromptHistoryTable(table, limit);
            return new Promise<void>((resolve) => setPromptHistoryTable(table, resolve));
        });

    promptHistoryWriteQueue = promptHistoryWriteQueue
        .catch(() => undefined)
        .then(scheduleUpdate);

    return promptHistoryWriteQueue;
};

export const upsertPromptHistoryDraft = (text: string): { id: string; text: string } | null => {
    const normalized = normalizePromptText(text);
    if (!normalized) {
        return null;
    }
    return {
        id: hashPromptText(normalized),
        text: normalized,
    };
};

export const getPromptHistoryRecords = async (): Promise<PromptHistoryRecord[]> => {
    await promptHistoryWriteQueue.catch(() => undefined);
    const table = await loadPromptHistory();
    return Object.values(table).sort((a, b) => (b.lastExecuted ?? 0) - (a.lastExecuted ?? 0));
};

export const clearPromptHistory = (): Promise<void> => {
    const scheduleClear = () =>
        new Promise<void>((resolve) => {
            setPromptHistoryTable({}, resolve);
        });

    promptHistoryWriteQueue = promptHistoryWriteQueue
        .catch(() => undefined)
        .then(scheduleClear);

    return promptHistoryWriteQueue;
};

export const createPromptHistoryTempId = () => nanoid();
