import React from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Copy } from 'lucide-react';

interface PromptTextareaProps {
  value: string;
  onChange: (value: string) => void;
  onCopyFromSite: () => void;
}

export const PromptTextarea: React.FC<PromptTextareaProps> = ({
  value,
  onChange,
  onCopyFromSite,
}) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm">Prompt</Label>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 px-2"
              onClick={onCopyFromSite}
            >
              <Copy className="h-3 w-3 mr-1" />
              Copy
            </Button>
          </TooltipTrigger>
          <TooltipContent>Copy prompt from site</TooltipContent>
        </Tooltip>
      </div>
      <Textarea 
        placeholder="Your prompt will appear here..."
        className="min-h-[80px] resize-none text-xs"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
};
