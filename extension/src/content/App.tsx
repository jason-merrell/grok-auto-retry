import React, { useEffect } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useGrokRetry } from '@/hooks/useGrokRetry';
import { useStorage } from '@/hooks/useStorage';
import { useModerationDetector } from '@/hooks/useModerationDetector';
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
  const { capturePromptFromSite, setupClickListener } = usePromptCapture();
  const panelResize = usePanelResize();
  const miniDrag = useMiniToggleDrag();

  // Handle moderation detection
  const handleModerationDetected = React.useCallback(() => {
    if (retry.isPaused || !retry.autoRetryEnabled) return;
    if (retry.retryCount >= retry.maxRetries) {
      console.log('[Grok Retry] Max retries reached');
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

  // Set up page title updates
  usePageTitle(
    retry.originalPageTitle,
    retry.retryCount,
    retry.maxRetries,
    retry.isPaused,
    retry.autoRetryEnabled,
    rateLimitDetected
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

  const handleMinimizeClick = () => {
    if (!miniDrag.dragMoved) {
      saveUIPref('isMinimized', !uiPrefs.isMinimized);
    }
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
          isPaused={retry.isPaused}
          autoRetryEnabled={retry.autoRetryEnabled}
          retryCount={retry.retryCount}
          maxRetries={retry.maxRetries}
          promptValue={retry.lastPromptValue}
          onResizeStart={panelResize.handleResizeStart}
          onPauseToggle={() => retry.setIsPaused(!retry.isPaused)}
          onMinimize={() => saveUIPref('isMinimized', true)}
          onAutoRetryChange={retry.setAutoRetryEnabled}
          onMaxRetriesChange={retry.setMaxRetries}
          onResetRetries={retry.resetRetries}
          onPromptChange={retry.updatePromptValue}
          onCopyFromSite={handleCopyFromSite}
        />
      </TooltipProvider>
    </div>
  );
};

export default App;
