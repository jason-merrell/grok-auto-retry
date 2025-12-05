import React, { useEffect } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useGrokRetry } from '@/hooks/useGrokRetry';
import { useStorage } from '@/hooks/useStorage';
import { useModerationDetector } from '@/hooks/useModerationDetector';
import { useSuccessDetector } from '@/hooks/useSuccessDetector';
import { usePageTitle } from '@/hooks/usePageTitle';
import { usePromptCapture } from '@/hooks/usePromptCapture';
import { usePanelResize } from '@/hooks/usePanelResize';
import { useMiniToggleDrag } from '@/hooks/useMiniToggleDrag';
import { useRouteMatch } from '@/hooks/useRouteMatch';
import { usePostId } from '@/hooks/usePostId';
import { ControlPanel } from '@/components/ControlPanel';
import { MiniToggle } from '@/components/MiniToggle';

const App: React.FC = () => {
  // Only show on /imagine/post/* routes
  const isImaginePostRoute = useRouteMatch('^/imagine/post/');
  const postId = usePostId();
  
  const retry = useGrokRetry(postId);
  const { data: uiPrefs, save: saveUIPref } = useStorage();
  const { capturePromptFromSite, copyPromptToSite, setupClickListener } = usePromptCapture();
  const panelResize = usePanelResize();
  const miniDrag = useMiniToggleDrag();
  const [rapidFailureDetected, setRapidFailureDetected] = React.useState(false);

  // Handle moderation detection
  const handleModerationDetected = React.useCallback(() => {
    // Check for rapid failure (≤6 seconds) - indicates pre-flight moderation filter
    if (retry.isSessionActive && retry.lastAttemptTime > 0) {
      const timeSinceAttempt = Date.now() - retry.lastAttemptTime;
      if (timeSinceAttempt <= 6000) {
        console.warn('[Grok Retry] Rapid failure detected (<6s) - likely pre-flight moderation filter on prompt text');
        setRapidFailureDetected(true);
      }
    }

    // Check if we should retry
    const shouldRetry = retry.autoRetryEnabled && retry.retryCount < retry.maxRetries;
    
    if (!shouldRetry) {
      console.log('[Grok Retry] Moderation detected but not retrying:', {
        autoRetryEnabled: retry.autoRetryEnabled,
        retryCount: retry.retryCount,
        maxRetries: retry.maxRetries
      });
      
      // End session if we're not going to retry
      if (retry.isSessionActive) {
        console.log('[Grok Retry] Ending session - no retry will occur');
        retry.endSession();
      }
      return;
    }

    console.log('[Grok Retry] Moderation detected, current count:', retry.retryCount);
    
    // If this is the first retry and we don't have a prompt, try to capture it
    let promptToUse = retry.lastPromptValue;
    if (retry.retryCount === 0 && !promptToUse) {
      const captured = capturePromptFromSite();
      if (captured) {
        promptToUse = captured;
        retry.updatePromptValue(captured);
        console.log('[Grok Retry] Auto-captured prompt on first moderation');
      }
    }
    
    console.log('[Grok Retry] Auto-retrying...');
    retry.clickMakeVideoButton(promptToUse);
  }, [retry, capturePromptFromSite]);

  const { rateLimitDetected } = useModerationDetector(handleModerationDetected, retry.autoRetryEnabled);

  // Handle successful video generation
  const handleSuccess = React.useCallback(() => {
    console.log('[Grok Retry] Video generated successfully!');
    retry.incrementVideosGenerated();
    
    const newCount = retry.videosGenerated + 1;
    
    // Check if we've reached the video goal
    if (newCount >= retry.videoGoal) {
      console.log(`[Grok Retry] Video goal reached! Generated ${newCount}/${retry.videoGoal} videos`);
      retry.endSession();
    } else {
      // Continue generating - restart the cycle
      console.log(`[Grok Retry] Progress: ${newCount}/${retry.videoGoal} videos generated, continuing...`);
      
      // Wait 8 seconds before next generation
      setTimeout(() => {
        retry.resetRetries(); // Reset retry count for next video
        retry.clickMakeVideoButton(retry.lastPromptValue);
      }, 8000);
    }
  }, [retry]);

  useSuccessDetector(handleSuccess, retry.isSessionActive);

  // Set up page title updates
  usePageTitle(
    retry.originalPageTitle,
    retry.retryCount,
    retry.maxRetries,
    retry.autoRetryEnabled,
    rateLimitDetected,
    retry.videoGoal,
    retry.videosGenerated
  );

  // Set up click listener for prompt capture
  useEffect(() => {
    return setupClickListener((value) => {
      retry.updatePromptValue(value);
    });
  }, [setupClickListener, retry]);

  const handleCopyFromSite = () => {
    const value = capturePromptFromSite();
    if (value) {
      retry.updatePromptValue(value);
    }
  };

  const handleCopyToSite = () => {
    if (retry.lastPromptValue) {
      copyPromptToSite(retry.lastPromptValue);
    }
  };

  const handlePromptAppend = (partial: string, position: 'prepend' | 'append') => {
    const currentPrompt = retry.lastPromptValue || '';
    
    // Check if partial content (trimmed and without period) already exists in prompt
    const partialContent = partial.trim().replace(/\.$/, '');
    if (currentPrompt.toLowerCase().includes(partialContent.toLowerCase())) {
      return; // Already exists, don't add
    }
    
    const newPrompt = position === 'prepend' 
      ? partial + currentPrompt 
      : currentPrompt + partial;
    
    retry.updatePromptValue(newPrompt);
  };

  const handleGenerateVideo = () => {
    // Capture prompt if not already captured
    let promptToUse = retry.lastPromptValue;
    if (!promptToUse) {
      const captured = capturePromptFromSite();
      if (captured) {
        promptToUse = captured;
        retry.updatePromptValue(captured);
      }
    }
    
    setRapidFailureDetected(false);
    retry.startSession();
    retry.clickMakeVideoButton(promptToUse);
  };

  const handleCancelSession = () => {
    retry.endSession();
  };

  const handleMinimizeClick = () => {
    if (!miniDrag.dragMoved) {
      saveUIPref('isMinimized', !uiPrefs.isMinimized);
    }
  };

  const handleMaximizeToggle = () => {
    saveUIPref('isMaximized', !uiPrefs.isMaximized);
  };

  // Don't render if not on imagine/post route
  if (!isImaginePostRoute) {
    return null;
  }

  if (uiPrefs.isMinimized) {
    return (
      <div className="dark animate-in fade-in duration-200">
        <TooltipProvider>
          <MiniToggle
            position={miniDrag.position}
            isDragging={miniDrag.isDragging}
            dragMoved={miniDrag.dragMoved}
            onDragStart={miniDrag.handleDragStart}
            onRestore={handleMinimizeClick}
          />
        </TooltipProvider>
      </div>
    );
  }

  return (
    <div className="dark animate-in fade-in slide-in-from-right-4 duration-300">
      <TooltipProvider>
        <ControlPanel
          width={panelResize.width}
          height={panelResize.height}
          fontSize={panelResize.fontSize}
          isMaximized={uiPrefs.isMaximized}
          autoRetryEnabled={retry.autoRetryEnabled}
          retryCount={retry.retryCount}
          maxRetries={retry.maxRetries}
          videoGoal={retry.videoGoal}
          videosGenerated={retry.videosGenerated}
          promptValue={retry.lastPromptValue}
          isSessionActive={retry.isSessionActive}
          rapidFailureDetected={rapidFailureDetected}
          onResizeStart={panelResize.handleResizeStart}
          onMinimize={() => saveUIPref('isMinimized', true)}
          onMaximizeToggle={handleMaximizeToggle}
          onAutoRetryChange={retry.setAutoRetryEnabled}
          onMaxRetriesChange={retry.setMaxRetries}
          onVideoGoalChange={retry.setVideoGoal}
          onResetRetries={retry.resetRetries}
          onPromptChange={retry.updatePromptValue}
          onPromptAppend={handlePromptAppend}
          onCopyFromSite={handleCopyFromSite}
          onCopyToSite={handleCopyToSite}
          onGenerateVideo={handleGenerateVideo}
          onCancelSession={handleCancelSession}
        />
      </TooltipProvider>
    </div>
  );
};

export default App;
