import { useState, useEffect, useCallback } from 'react';
import { PromptPartial } from '@/config/promptPartials';

const STORAGE_KEY = 'grokRetry_customPartials';

export const useCustomPartials = () => {
    const [customPartials, setCustomPartials] = useState<PromptPartial[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Load custom partials from chrome.storage.local
    useEffect(() => {
        chrome.storage.local.get([STORAGE_KEY], (result) => {
            if (result[STORAGE_KEY]) {
                setCustomPartials(result[STORAGE_KEY]);
            }
            setIsLoading(false);
        });
    }, []);

    // Save custom partials to chrome.storage.local
    const savePartials = useCallback((partials: PromptPartial[]) => {
        setCustomPartials(partials);
        chrome.storage.local.set({ [STORAGE_KEY]: partials });
    }, []);

    // Add a new custom partial
    const addPartial = useCallback((partial: Omit<PromptPartial, 'id'>) => {
        const newPartial: PromptPartial = {
            ...partial,
            id: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        };
        const updated = [...customPartials, newPartial];
        savePartials(updated);
        return newPartial;
    }, [customPartials, savePartials]);

    // Update an existing custom partial
    const updatePartial = useCallback((id: string, updates: Partial<PromptPartial>) => {
        const updated = customPartials.map(p =>
            p.id === id ? { ...p, ...updates } : p
        );
        savePartials(updated);
    }, [customPartials, savePartials]);

    // Delete a custom partial
    const deletePartial = useCallback((id: string) => {
        const updated = customPartials.filter(p => p.id !== id);
        savePartials(updated);
    }, [customPartials, savePartials]);

    return {
        customPartials,
        isLoading,
        addPartial,
        updatePartial,
        deletePartial,
    };
};
