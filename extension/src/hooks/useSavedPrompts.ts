import { useEffect, useState, useCallback } from "react";

export interface SavedPrompt {
    name: string;
    text: string;
}

const STORAGE_KEY = "savedPrompts";

export const useSavedPrompts = () => {
    const [prompts, setPrompts] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        try {
            chrome.storage.local.get(STORAGE_KEY, (result) => {
                const map = (result?.[STORAGE_KEY] || {}) as Record<string, string>;
                setPrompts(map);
                setIsLoading(false);
            });
            // Keep in sync when other components/pages update saved prompts
            const handleChange = (
                changes: { [key: string]: chrome.storage.StorageChange },
                areaName: string
            ) => {
                if (areaName !== "local") return;
                if (STORAGE_KEY in changes) {
                    const next = (changes[STORAGE_KEY].newValue || {}) as Record<string, string>;
                    setPrompts(next);
                }
            };
            chrome.storage.onChanged.addListener(handleChange);
            return () => {
                chrome.storage.onChanged.removeListener(handleChange);
            };
        } catch {
            // Fallback to window.localStorage when chrome.storage is unavailable
            const raw = window.localStorage.getItem(STORAGE_KEY);
            setPrompts(raw ? JSON.parse(raw) : {});
            setIsLoading(false);
        }
    }, []);

    const persist = useCallback((next: Record<string, string>) => {
        setPrompts(next);
        try {
            chrome.storage.local.set({ [STORAGE_KEY]: next });
        } catch {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        }
    }, []);

    const savePrompt = useCallback((name: string, text: string) => {
        const trimmed = name.trim();
        if (!trimmed) return false;
        const next = { ...prompts, [trimmed]: text };
        persist(next);
        return true;
    }, [prompts, persist]);

    const deletePrompt = useCallback((name: string) => {
        const next = { ...prompts };
        delete next[name];
        persist(next);
    }, [prompts, persist]);

    const renamePrompt = useCallback((oldName: string, newName: string) => {
        const trimmed = newName.trim();
        if (!prompts[oldName] || !trimmed) return false;
        const next = { ...prompts };
        next[trimmed] = next[oldName];
        delete next[oldName];
        persist(next);
        return true;
    }, [prompts, persist]);

    const loadPrompt = useCallback((name: string) => prompts[name] || "", [prompts]);

    const listPrompts = useCallback((): SavedPrompt[] => {
        return Object.keys(prompts)
            .sort((a, b) => a.localeCompare(b))
            .map((name) => ({ name, text: prompts[name] }));
    }, [prompts]);

    return { prompts, isLoading, savePrompt, deletePrompt, renamePrompt, loadPrompt, listPrompts };
};
