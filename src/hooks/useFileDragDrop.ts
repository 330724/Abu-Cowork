import { useEffect, useState, useCallback } from 'react';
import { listen, TauriEvent } from '@tauri-apps/api/event';

interface DragDropPayload {
  paths: string[];
  position: { x: number; y: number };
}

export function useFileDragDrop(onDrop: (paths: string[]) => void) {
  const [isDragging, setIsDragging] = useState(false);

  const stableDrop = useCallback((paths: string[]) => onDrop(paths), [onDrop]);

  useEffect(() => {
    const unlisteners: (() => void)[] = [];

    async function setup() {
      unlisteners.push(
        await listen<DragDropPayload>(TauriEvent.DRAG_ENTER, () => {
          setIsDragging(true);
        })
      );
      unlisteners.push(
        await listen<DragDropPayload>(TauriEvent.DRAG_LEAVE, () => {
          setIsDragging(false);
        })
      );
      unlisteners.push(
        await listen<DragDropPayload>(TauriEvent.DRAG_DROP, (event) => {
          setIsDragging(false);
          stableDrop(event.payload.paths);
        })
      );
    }

    setup();
    return () => unlisteners.forEach((fn) => fn());
  }, [stableDrop]);

  return { isDragging };
}
