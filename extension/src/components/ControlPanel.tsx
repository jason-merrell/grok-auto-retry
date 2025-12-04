import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ResizeHandle } from './ResizeHandle';
import { PanelHeader } from './PanelHeader';
import { RetryControls } from './RetryControls';
import { RetryStats } from './RetryStats';
import { MaxRetriesControls } from './MaxRetriesControls';
import { PromptTextarea } from './PromptTextarea';
import { PromptPartials } from './PromptPartials';
import { ActionButton } from './ActionButton';

interface ControlPanelProps {
  width: number;
  height: number;
  fontSize: number;
  autoRetryEnabled: boolean;
  retryCount: number;
  maxRetries: number;
  promptValue: string;
  isSessionActive: boolean;
  onResizeStart: (e: React.MouseEvent) => void;
  onMinimize: () => void;
  onAutoRetryChange: (enabled: boolean) => void;
  onMaxRetriesChange: (value: number) => void;
  onResetRetries: () => void;
  onPromptChange: (value: string) => void;
  onPromptAppend: (value: string, position: 'prepend' | 'append') => void;
  onCopyFromSite: () => void;
  onCopyToSite: () => void;
  onGenerateVideo: () => void;
  onCancelSession: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  width,
  height,
  fontSize,
  autoRetryEnabled,
  retryCount,
  maxRetries,
  promptValue,
  isSessionActive,
  onResizeStart,
  onMinimize,
  onAutoRetryChange,
  onMaxRetriesChange,
  onResetRetries,
  onPromptChange,
  onPromptAppend,
  onCopyFromSite,
  onCopyToSite,
  onGenerateVideo,
  onCancelSession,
}) => {
  return (
    <Card 
      className="fixed shadow-xl flex flex-col"
      style={{
        bottom: '16px',
        right: '16px',
        width: `${width}px`,
        height: `${height}px`,
        fontSize: `${fontSize}px`,
      }}
    >
      <ResizeHandle onResizeStart={onResizeStart} />
      
      <CardHeader className="pb-3 shrink-0">
        <PanelHeader 
          onMinimize={onMinimize}
        />
      </CardHeader>
      
      <CardContent 
        className="space-y-3 overflow-auto flex-1" 
        style={{ maxHeight: `${height - 140}px` }}
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
          onCopyToSite={onCopyToSite}
        />
        
        <PromptPartials 
          onAppendPartial={onPromptAppend}
        />
      </CardContent>
      
      <div className="px-6 pb-4 shrink-0 border-t border-border pt-3">
        <ActionButton
          isSessionActive={isSessionActive}
          onGenerate={onGenerateVideo}
          onCancel={onCancelSession}
        />
      </div>
    </Card>
  );
};
