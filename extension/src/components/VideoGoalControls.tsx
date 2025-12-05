import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Plus, Minus } from 'lucide-react';

interface VideoGoalControlsProps {
  videoGoal: number;
  videosGenerated: number;
  isSessionActive: boolean;
  onVideoGoalChange: (value: number) => void;
  disabled?: boolean;
}

export const VideoGoalControls: React.FC<VideoGoalControlsProps> = ({
  videoGoal,
  videosGenerated,
  isSessionActive,
  onVideoGoalChange,
  disabled = false,
}) => {
  const handleIncrement = () => {
    onVideoGoalChange(videoGoal + 1);
  };

  const handleDecrement = () => {
    onVideoGoalChange(videoGoal - 1);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || 1;
    onVideoGoalChange(value);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Tooltip>
          <TooltipTrigger asChild>
            <Label className="text-sm cursor-help">Video Goal</Label>
          </TooltipTrigger>
          <TooltipContent>
            Number of videos to generate automatically with 8-second delays (1-50)
          </TooltipContent>
        </Tooltip>
        {isSessionActive && videosGenerated > 0 && (
          <span className="text-xs text-muted-foreground">
            {videosGenerated}/{videoGoal} generated
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={handleDecrement}
          disabled={disabled || videoGoal <= 1}
        >
          <Minus className="h-3 w-3" />
        </Button>
        <Input
          type="number"
          min="1"
          max="50"
          value={videoGoal}
          onChange={handleInputChange}
          className="h-8 text-center flex-1"
          disabled={disabled}
        />
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={handleIncrement}
          disabled={disabled || videoGoal >= 50}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
};
