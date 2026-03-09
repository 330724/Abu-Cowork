import { useEffect, useRef } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { usePreviewStore } from '@/stores/previewStore';
import { useActiveConversation } from '@/stores/chatStore';
import { ScrollArea } from '@/components/ui/scroll-area';
import TaskProgressPanel from './TaskProgressPanel';
import WorkspaceSection from './WorkspaceSection';
import ContextSection from './ContextSection';
import PreviewPanel from './PreviewPanel';

const PANEL_WIDTH = 280;
const PREVIEW_WIDTH = 420;

export default function RightPanel() {
  const collapsed = useSettingsStore((s) => s.rightPanelCollapsed);
  const setRightPanelCollapsed = useSettingsStore((s) => s.setRightPanelCollapsed);
  const viewMode = useSettingsStore((s) => s.viewMode);
  const previewFilePath = usePreviewStore((s) => s.previewFilePath);
  const conversation = useActiveConversation();
  const prevHasMessagesRef = useRef(false);
  // Track whether auto-expand already fired for this conversation
  const autoExpandedRef = useRef(false);

  // Check if conversation has started (has messages)
  const hasMessages = (conversation?.messages?.length ?? 0) > 0;

  // Conversation has a workspace → panel is meaningful
  const hasWorkspace = !!conversation?.workspacePath;

  // Conversation has tool calls → task steps in progress
  const hasToolCalls = conversation?.messages?.some(
    (m) => m.toolCalls && m.toolCalls.length > 0
  ) ?? false;

  // Reset auto-expand flag when switching conversations
  const conversationId = conversation?.id ?? null;
  useEffect(() => {
    autoExpandedRef.current = false;
  }, [conversationId]);

  // Auto-expand: workspace attached or tool calls started (not pure Q&A)
  // Only fires once per conversation — does not fight manual collapse
  useEffect(() => {
    if (autoExpandedRef.current || !collapsed || !hasMessages) return;
    if (hasWorkspace || hasToolCalls) {
      autoExpandedRef.current = true;
      setRightPanelCollapsed(false);
    }
  }, [hasMessages, hasWorkspace, hasToolCalls, collapsed, setRightPanelCollapsed]);

  // Track message state for rendering logic
  useEffect(() => {
    prevHasMessagesRef.current = hasMessages;
  }, [hasMessages]);

  // Auto-expand panel when a file preview is opened
  useEffect(() => {
    if (previewFilePath && collapsed) {
      setRightPanelCollapsed(false);
    }
  }, [previewFilePath, collapsed, setRightPanelCollapsed]);

  // Close preview when switching conversations
  useEffect(() => {
    usePreviewStore.getState().closePreview();
  }, [conversationId]);

  // Determine if we're showing preview
  const showPreview = !!previewFilePath;
  const currentWidth = showPreview ? PREVIEW_WIDTH : PANEL_WIDTH;

  // Hide panel when not in chat view or no conversation has started yet
  if (viewMode !== 'chat' || (!hasMessages && !showPreview)) {
    return null;
  }

  // When collapsed, render nothing (toggle button is in the title bar)
  if (collapsed) {
    return null;
  }

  // When expanded, render the full panel
  return (
    <div
      className="shrink-0 border-l border-[#e8e4dd] bg-[#f5f3ee] h-full flex flex-col overflow-hidden transition-all duration-200"
      style={{ width: currentWidth, minWidth: currentWidth, maxWidth: currentWidth }}
    >
      {showPreview ? (
        // Preview mode - full panel is preview
        <PreviewPanel />
      ) : (
        // Normal mode - show details sections
        <>
          {/* Scrollable content — pt-8 to clear overlay title bar area */}
          <ScrollArea className="flex-1 pt-5">
            <div className="p-4 space-y-5">
              {/* Progress - only show when has planned steps */}
              <TaskProgressPanel />
              {/* Workspace with files inside */}
              <WorkspaceSection />
              <div className="border-t border-[#e8e4dd]" />
              <ContextSection />
            </div>
          </ScrollArea>
        </>
      )}
    </div>
  );
}
