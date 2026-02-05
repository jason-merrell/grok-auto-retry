import { useState, useCallback, useRef, useEffect } from 'react';
import { useGrokRetryUI } from './useGrokRetryUI';

const DRAG_THRESHOLD = 5; // pixels to distinguish click from drag

/**
 * Enables dragging of the minimized panel toggle button.
 * 
 * Provides:
 * - Mouse-based drag positioning
 * - Distinction between click and drag (via threshold)
 * - Persistent position storage via useGrokRetryUI
 * - Drag state tracking for UI feedback
 * - Default positioning (bottom-right corner)
 * 
 * Uses a 5px movement threshold to differentiate between clicks
 * (to toggle panel) and drags (to reposition).
 * 
 * @returns Position, drag state, and event handlers
 * 
 * @example
 * ```tsx
 * const miniDrag = useGrokRetryMiniToggleDrag();
 * 
 * <div
 *   style={{ left: miniDrag.position.x, top: miniDrag.position.y }}
 *   onMouseDown={miniDrag.handleDragStart}
 *   onClick={!miniDrag.dragMoved ? togglePanel : undefined}
 * />
 * ```
 */
export const useGrokRetryMiniToggleDrag = () => {
    const { data: storage, save } = useGrokRetryUI();
    const [position, setPosition] = useState(
        storage.miniTogglePosition || { x: window.innerWidth - 80, y: window.innerHeight - 80 }
    );
    const [isDragging, setIsDragging] = useState(false);
    const [dragMoved, setDragMoved] = useState(false);

    const startX = useRef(0);
    const startY = useRef(0);
    const startLeft = useRef(0);
    const startTop = useRef(0);

    // Sync with storage
    useEffect(() => {
        if (storage.miniTogglePosition) {
            setPosition(storage.miniTogglePosition);
        }
    }, [storage.miniTogglePosition]);

    const handleDragStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);
        setDragMoved(false);

        startX.current = e.clientX;
        startY.current = e.clientY;
        startLeft.current = position.x;
        startTop.current = position.y;
    }, [position]);

    const handleDragMove = useCallback((e: MouseEvent) => {
        if (!isDragging) return;

        const deltaX = e.clientX - startX.current;
        const deltaY = e.clientY - startY.current;

        // Check if moved beyond threshold
        if (Math.abs(deltaX) > DRAG_THRESHOLD || Math.abs(deltaY) > DRAG_THRESHOLD) {
            setDragMoved(true);
        }

        const newX = startLeft.current + deltaX;
        const newY = startTop.current + deltaY;

        // Keep within viewport bounds (with some padding)
        const boundedX = Math.max(10, Math.min(window.innerWidth - 60, newX));
        const boundedY = Math.max(10, Math.min(window.innerHeight - 60, newY));

        setPosition({ x: boundedX, y: boundedY });
    }, [isDragging]);

    const handleDragEnd = useCallback(() => {
        if (isDragging) {
            setIsDragging(false);

            // Only save if actually moved
            if (dragMoved) {
                save('miniTogglePosition', position);
            }
        }
    }, [isDragging, dragMoved, position, save]);

    // Set up global mouse listeners
    useEffect(() => {
        if (isDragging) {
            document.addEventListener('mousemove', handleDragMove);
            document.addEventListener('mouseup', handleDragEnd);

            return () => {
                document.removeEventListener('mousemove', handleDragMove);
                document.removeEventListener('mouseup', handleDragEnd);
            };
        }
    }, [isDragging, handleDragMove, handleDragEnd]);

    return {
        position,
        isDragging,
        dragMoved,
        handleDragStart,
    };
};
