import { useState, useCallback, useRef, useEffect } from 'react';
import { useGrokRetryUI } from './useGrokRetryUI';

const MIN_WIDTH = 260;
const MAX_WIDTH = 520;
const MIN_HEIGHT = 200;
const MAX_HEIGHT = 800;
const BASE_WIDTH = 320;
const MIN_FONT = 11;
const MAX_FONT = 16;

/**
 * Manages interactive resizing of the control panel.
 * 
 * Provides:
 * - Mouse-based resize handles for width and height
 * - Dynamic font scaling based on panel width
 * - Dimension constraints (min/max bounds)
 * - Persistent storage of dimensions via useGrokRetryUI
 * - Resize state tracking (isResizing flag)
 * 
 * Calculates responsive font size that scales proportionally with
 * panel width for optimal readability at any size.
 * 
 * @returns Panel dimensions, font size, resize handlers, and state
 * 
 * @example
 * ```tsx
 * const panelResize = useGrokRetryPanelResize();
 * 
 * <div
 *   style={{
 *     width: panelResize.width,
 *     height: panelResize.height,
 *     fontSize: panelResize.fontSize
 *   }}
 *   onMouseDown={panelResize.handleResizeStart}
 * />
 * ```
 */
export const useGrokRetryPanelResize = () => {
    const { data: storage, save } = useGrokRetryUI();
    const [width, setWidth] = useState(storage.panelWidth);
    const [height, setHeight] = useState(storage.panelHeight);
    const [isResizing, setIsResizing] = useState(false);

    const startX = useRef(0);
    const startY = useRef(0);
    const startWidth = useRef(0);
    const startHeight = useRef(0);

    // Sync with storage
    useEffect(() => {
        setWidth(storage.panelWidth);
        setHeight(storage.panelHeight);
    }, [storage.panelWidth, storage.panelHeight]);

    // Calculate font size based on width
    const fontSize = Math.max(
        MIN_FONT,
        Math.min(MAX_FONT, (width / BASE_WIDTH) * 14)
    );

    const handleResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
        startX.current = e.clientX;
        startY.current = e.clientY;
        startWidth.current = width;
        startHeight.current = height;
    }, [width, height]);

    const handleResizeMove = useCallback((e: MouseEvent) => {
        if (!isResizing) return;

        // Calculate deltas (inverted because we're dragging from top-left)
        const deltaX = startX.current - e.clientX;
        const deltaY = startY.current - e.clientY;

        const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth.current + deltaX));
        const newHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, startHeight.current + deltaY));

        setWidth(newWidth);
        setHeight(newHeight);
    }, [isResizing]);

    const handleResizeEnd = useCallback(() => {
        if (isResizing) {
            setIsResizing(false);
            // Save to storage
            save('panelWidth', width);
            save('panelHeight', height);
        }
    }, [isResizing, width, height, save]);

    // Set up global mouse listeners
    useEffect(() => {
        if (isResizing) {
            document.addEventListener('mousemove', handleResizeMove);
            document.addEventListener('mouseup', handleResizeEnd);

            return () => {
                document.removeEventListener('mousemove', handleResizeMove);
                document.removeEventListener('mouseup', handleResizeEnd);
            };
        }
    }, [isResizing, handleResizeMove, handleResizeEnd]);

    return {
        width,
        height,
        fontSize,
        isResizing,
        handleResizeStart,
    };
};
