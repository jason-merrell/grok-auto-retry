import { useEffect } from 'react';

export const usePageTitle = (
    originalTitle: string,
    retryCount: number,
    maxRetries: number,
    autoRetryEnabled: boolean,
    isRateLimited: boolean = false,
    videoGoal: number = 1,
    videosGenerated: number = 0
) => {
    useEffect(() => {
        if (!autoRetryEnabled || retryCount === 0) {
            document.title = originalTitle;
            return;
        }

        // Check if session is complete
        if (videoGoal > 1 && videosGenerated >= videoGoal) {
            document.title = `✅ ${videosGenerated}/${videoGoal} Complete - ${originalTitle}`;
        } else if (isRateLimited) {
            document.title = `⏳ Rate Limited - ${originalTitle}`;
        } else if (retryCount >= maxRetries) {
            document.title = `❌ ${originalTitle}`;
        } else if (videoGoal > 1) {
            // Show video progress when videoGoal is set
            document.title = `🎬 ${videosGenerated ?? 0}/${videoGoal ?? 1} | 🔄 ${retryCount ?? 0}/${maxRetries ?? 3} ${originalTitle}`;
        } else {
            document.title = `🔄 ${retryCount ?? 0}/${maxRetries ?? 3} ${originalTitle}`;
        }
    }, [originalTitle, retryCount, maxRetries, autoRetryEnabled, isRateLimited, videoGoal, videosGenerated]);
};
