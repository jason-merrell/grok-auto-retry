import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import {
    normalizePromptText,
    hashPromptText,
    recordPromptHistoryOutcome,
    getPromptHistoryRecords,
    clearPromptHistory,
} from '../../src/lib/promptHistory';
import usePromptHistory from '../../src/hooks/usePromptHistory';

describe('promptHistory utilities', () => {
    beforeEach(async () => {
        await clearPromptHistory();
        await Promise.resolve();
    });

    it('normalizes whitespace and preserves meaningful content', () => {
        const raw = '  Hello\n\n   world\t!  ';
        expect(normalizePromptText(raw)).toBe('Hello world!');
    });

    it('hashes prompts deterministically', () => {
        const first = hashPromptText('Test prompt');
        const second = hashPromptText('Test prompt');
        const different = hashPromptText('Another prompt');

        expect(first).toBe(second);
        expect(first).not.toBe(different);
        expect(first).toHaveLength(16);
    });

    it('records successes and failures with outcome details', async () => {
        recordPromptHistoryOutcome({ text: 'Example prompt', status: 'success', timestamp: 1000 });
        await Promise.resolve();
        recordPromptHistoryOutcome({ text: 'Example prompt', status: 'failure', layer: 2, timestamp: 2000 });
        await Promise.resolve();

        const records = await getPromptHistoryRecords();
        expect(records).toHaveLength(1);

        const [record] = records;
        expect(record.executionsAmount).toBe(2);
        expect(record.successAmount).toBe(1);
        expect(record.l1FailureAmount).toBe(0);
        expect(record.l2FailureAmount).toBe(1);
        expect(record.l3FailureAmount).toBe(0);
        expect(record.lastOutcome).toBe('failure');
        expect(record.lastLayer).toBe(2);
        expect(record.lastExecuted).toBe(2000);
    });
});

describe('usePromptHistory hook', () => {
    beforeEach(async () => {
        await clearPromptHistory();
        await Promise.resolve();
    });

    const flush = async () => {
        await act(async () => {
            await Promise.resolve();
        });
    };

    it('loads prompt history records and sorts by lastExecuted desc', async () => {
        recordPromptHistoryOutcome({ text: 'First prompt', status: 'success', timestamp: 1000 });
        await Promise.resolve();
        recordPromptHistoryOutcome({ text: 'Second prompt', status: 'success', timestamp: 2000 });
        await Promise.resolve();

        const { result } = renderHook(() => usePromptHistory());
        await flush();

        expect(result.current.records.map((r) => r.text)).toEqual(['Second prompt', 'First prompt']);
    });

    it('updates records when new outcomes are recorded', async () => {
        const { result } = renderHook(() => usePromptHistory());
        await flush();
        expect(result.current.records).toEqual([]);

        await act(async () => {
            recordPromptHistoryOutcome({ text: 'Live prompt', status: 'success', timestamp: 3000 });
            await Promise.resolve();
        });

        expect(result.current.records).toHaveLength(1);
        expect(result.current.records[0].text).toBe('Live prompt');
        expect(result.current.records[0].successAmount).toBe(1);

        await act(async () => {
            recordPromptHistoryOutcome({ text: 'Live prompt', status: 'failure', layer: 1, timestamp: 4000 });
            await Promise.resolve();
        });

        expect(result.current.records[0].executionsAmount).toBe(2);
        expect(result.current.records[0].lastOutcome).toBe('failure');
        expect(result.current.records[0].lastLayer).toBe(1);
    });
});
