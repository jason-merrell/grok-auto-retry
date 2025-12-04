import React from 'react';

interface ResizeHandleProps {
  onResizeStart: (e: React.MouseEvent) => void;
}

export const ResizeHandle: React.FC<ResizeHandleProps> = ({ onResizeStart }) => {
  return (
    <div
      className="absolute top-0 left-0 w-6 h-6 cursor-nwse-resize hover:bg-primary/30 active:bg-primary/40 rounded-tl-lg transition-all duration-150 z-10"
      onMouseDown={onResizeStart}
      title="Drag to resize"
    >
      <div className="absolute top-1 left-1 w-1 h-1 bg-muted-foreground/50 rounded-full" />
      <div className="absolute top-1 left-3 w-1 h-1 bg-muted-foreground/50 rounded-full" />
      <div className="absolute top-3 left-1 w-1 h-1 bg-muted-foreground/50 rounded-full" />
    </div>
  );
};
