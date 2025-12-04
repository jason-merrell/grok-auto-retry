import { useState, useCallback, useEffect } from 'react';

export interface PostData {
  maxRetries: number;
  autoRetryEnabled: boolean;
  lastPromptValue: string;
  retryCount: number;
  isSessionActive: boolean;
}

const DEFAULT_POST_DATA: PostData = {
  maxRetries: 3,
  autoRetryEnabled: false,
  lastPromptValue: '',
  retryCount: 0,
  isSessionActive: false,
};

const STORAGE_PREFIX = 'grokRetryPost_';

export const usePostStorage = (postId: string | null) => {
  const [data, setData] = useState<PostData>(DEFAULT_POST_DATA);
  const [isLoading, setIsLoading] = useState(true);

  // Load from sessionStorage when postId changes
  useEffect(() => {
    if (!postId) {
      setData(DEFAULT_POST_DATA);
      setIsLoading(false);
      return;
    }

    const storageKey = `${STORAGE_PREFIX}${postId}`;
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        setData({ ...DEFAULT_POST_DATA, ...parsed });
        console.log('[Grok Retry] Loaded state for post:', postId);
      } else {
        setData(DEFAULT_POST_DATA);
      }
    } catch (error) {
      console.error('[Grok Retry] Failed to load post storage:', error);
      setData(DEFAULT_POST_DATA);
    }
    setIsLoading(false);
  }, [postId]);

  // Save to sessionStorage
  const saveToPost = useCallback((updates: Partial<PostData>) => {
    if (!postId) return;

    setData((prev) => {
      const updated = { ...prev, ...updates };
      const storageKey = `${STORAGE_PREFIX}${postId}`;
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(updated));
      } catch (error) {
        console.error('[Grok Retry] Failed to save post storage:', error);
      }
      return updated;
    });
  }, [postId]);

  // Save a specific key
  const save = useCallback(<K extends keyof PostData>(
    key: K,
    value: PostData[K]
  ) => {
    saveToPost({ [key]: value });
  }, [saveToPost]);

  // Clear post data
  const clear = useCallback(() => {
    if (!postId) return;
    
    setData(DEFAULT_POST_DATA);
    const storageKey = `${STORAGE_PREFIX}${postId}`;
    try {
      sessionStorage.removeItem(storageKey);
      console.log('[Grok Retry] Cleared state for post:', postId);
    } catch (error) {
      console.error('[Grok Retry] Failed to clear post storage:', error);
    }
  }, [postId]);

  return { data, save, saveAll: saveToPost, clear, isLoading };
};
