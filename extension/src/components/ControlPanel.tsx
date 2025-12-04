import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ResizeHandle } from './ResizeHandle';
import { PanelHeader } from './PanelHeader';
import { RetryControls } from './RetryControls';
import { RetryStats } from './RetryStats';
import { MaxRetriesControls } from './MaxRetriesControls';
import { PromptTextarea } from './PromptTextarea';

interface ControlPanelProps {
  width: number;
  height: number;
  fontSize: number;
  isPaused: boolean;
  autoRetryEnabled: boolean;
  retryCount: number;
  maxRetries: number;
  promptValue: string;
  onResizeStart: (e: React.MouseEvent) => void;
  onPauseToggle: () => void;
  onMinimize: () => void;
  onAutoRetryChange: (enabled: boolean) => void;
  onMaxRetriesChange: (value: number) => void;
  onResetRetries: () => void;
  onPromptChange: (value: string) => void;
  onCopyFromSite: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  width,
  height,
  fontSize,
  isPaused,
  autoRetryEnabled,
  retryCount,
  maxRetries,
  promptValue,
  onResizeStart,
  onPauseToggle,
  onMinimize,
  onAutoRetryChange,
  onMaxRetriesChange,
  onResetRetries,
  onPromptChange,
  onCopyFromSite,
}) => {
  return (
    <Card 
      className="fixed shadow-xl"
      style={{
        bottom: '16px',
        right: '16px',
        width: `${width}px`,
        height: `${height}px`,
        fontSize: `${fontSize}px`,
      }}
    >
      <ResizeHandle onResizeStart={onResizeStart} />
      
      <CardHeader className="pb-3">
        <PanelHeader 
          isPaused={isPaused}
          onPauseToggle={onPauseToggle}
          onMinimize={onMinimize}
        />
      </CardHeader>
      
      <CardContent 
        className="space-y-3 overflow-auto" 
        style={{ maxHeight: `${height - 80}px` }}
      >
        <RetryControls 
          autoRetryEnabled={autoRetryEnabled}
          onAutoRetryChange={onAutoRetryChange}
        />
        
        <RetryStats 
          retryCount={retryCount}
          maxRetries={maxRetries}
        />
        
        <MaxRetriesControls 
          maxRetries={maxRetries}
          retryCount={retryCount}
          onMaxRetriesChange={onMaxRetriesChange}
          onResetRetries={onResetRetries}
        />
        
        <PromptTextarea 
          value={promptValue}
          onChange={onPromptChange}
          onCopyFromSite={onCopyFromSite}
        />
      </CardContent>
    </Card>
  );
};
