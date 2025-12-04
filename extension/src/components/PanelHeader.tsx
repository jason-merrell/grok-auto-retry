import React from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Pause, Play, Minimize2 } from 'lucide-react';

interface PanelHeaderProps {
  isPaused: boolean;
  onPauseToggle: () => void;
  onMinimize: () => void;
}

export const PanelHeader: React.FC<PanelHeaderProps> = ({
  isPaused,
  onPauseToggle,
  onMinimize,
}) => {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-base font-semibold">Grok Auto Retry</h2>
      <div className="flex gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7"
              onClick={onPauseToggle}
            >
              {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isPaused ? 'Resume' : 'Pause'}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7"
              onClick={onMinimize}
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Minimize</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
};
