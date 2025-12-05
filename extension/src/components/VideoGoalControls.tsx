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
  const [inputValue, setInputValue] = React.useState(videoGoal.toString());

  const handleIncrement = () => {
    const newValue = videoGoal + 1;
    onVideoGoalChange(newValue);
    setInputValue(newValue.toString());
  };

  const handleDecrement = () => {
    const newValue = videoGoal - 1;
    onVideoGoalChange(newValue);
    setInputValue(newValue.toString());
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleApplyValue = () => {
    const value = parseInt(inputValue) || 1;
    const clampedValue = Math.max(1, Math.min(50, value));
    onVideoGoalChange(clampedValue);
    setInputValue(clampedValue.toString());
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleApplyValue();
    }
  };

  // Sync local state when prop changes externally
  React.useEffect(() => {
    setInputValue(videoGoal.toString());
  }, [videoGoal]);

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
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={handleDecrement}
          disabled={disabled || videoGoal <= 1}
        >
          <Minus className="h-3 w-3" />
        </Button>
        <Input
          type="number"
          min="1"
          max="50"
          value={inputValue}
          onChange={handleInputChange}
          onKeyPress={handleKeyPress}
          className="h-8 text-center"
          disabled={disabled}
        />
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={handleIncrement}
          disabled={disabled || videoGoal >= 50}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
};
