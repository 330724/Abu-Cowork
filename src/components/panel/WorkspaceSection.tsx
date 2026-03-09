import { useWorkspaceStore, getFolderName } from '@/stores/workspaceStore';
import { useChatStore } from '@/stores/chatStore';
import { usePermissionStore, type PermissionDuration } from '@/stores/permissionStore';
import { useI18n } from '@/i18n';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { exists } from '@tauri-apps/plugin-fs';
import {
  FolderOpen,
  ExternalLink,
  FileText,
  ChevronDown,
  Check,
  Folder,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEffect, useState, useRef } from 'react';
import PermissionDialog from '@/components/common/PermissionDialog';
import FilesSection from './FilesSection';
import { cn } from '@/lib/utils';

export default function WorkspaceSection() {
  const currentPath = useWorkspaceStore((s) => s.currentPath);
  const recentPaths = useWorkspaceStore((s) => s.recentPaths);
  const setWorkspaceGlobal = useWorkspaceStore((s) => s.setWorkspace);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const setConversationWorkspace = useChatStore((s) => s.setConversationWorkspace);

  // Wrapper: update both global workspace and active conversation
  const setWorkspace = (path: string | null) => {
    setWorkspaceGlobal(path);
    if (activeConversationId) {
      setConversationWorkspace(activeConversationId, path);
    }
  };

  const grantPermission = usePermissionStore((s) => s.grantPermission);
  const hasPermission = usePermissionStore((s) => s.hasPermission);
  const [hasClaudeMd, setHasClaudeMd] = useState(false);
  const [pendingFolder, setPendingFolder] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [expanded, setExpanded] = useState(true);  // Main section expand/collapse
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isDropdownOpen]);

  // Check for CLAUDE.md when workspace changes
  useEffect(() => {
    async function checkClaudeMd() {
      if (!currentPath) {
        setHasClaudeMd(false);
        return;
      }
      try {
        const claudePath = `${currentPath}/CLAUDE.md`;
        const fileExists = await exists(claudePath);
        setHasClaudeMd(fileExists);
      } catch {
        setHasClaudeMd(false);
      }
    }
    checkClaudeMd();
  }, [currentPath]);

  const handleOpenInFinder = async () => {
    if (!currentPath) return;
    try {
      await revealItemInDir(currentPath);
    } catch (err) {
      console.error('Failed to open folder:', err);
    }
  };

  const handleSelectWorkspace = async () => {
    setIsDropdownOpen(false);
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: t.panel.selectWorkspace,
      });
      if (selected) {
        const folderPath = selected as string;
        // Check if already has permission
        if (hasPermission(folderPath, 'read')) {
          setWorkspace(folderPath);
        } else {
          setPendingFolder(folderPath);
        }
      }
    } catch (err) {
      console.error('Failed to select workspace:', err);
    }
  };

  const handleSelectRecent = (folderPath: string) => {
    setIsDropdownOpen(false);
    if (hasPermission(folderPath, 'read')) {
      setWorkspace(folderPath);
    } else {
      setPendingFolder(folderPath);
    }
  };

  const handleAllowPermission = (duration: PermissionDuration) => {
    if (pendingFolder) {
      grantPermission(pendingFolder, ['read', 'write', 'execute'], duration);
      setWorkspace(pendingFolder);
      setPendingFolder(null);
    }
  };

  const handleDenyPermission = () => {
    setPendingFolder(null);
  };

  const folderName = currentPath ? getFolderName(currentPath) : null;

  return (
    <>
      {/* Permission Dialog */}
      {pendingFolder && (
        <PermissionDialog
          request={{ type: 'workspace', path: pendingFolder }}
          onAllow={handleAllowPermission}
          onDeny={handleDenyPermission}
        />
      )}

      <div className="space-y-3">
        {/* Header - clickable to expand/collapse */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setExpanded(!expanded)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(!expanded); } }}
          className="flex items-center justify-between w-full text-left group cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-[#656358]" />
            <h3 className="text-[13px] font-medium text-[#29261b]">
              {t.panel.workspace}
            </h3>
          </div>
          <div className="flex items-center gap-1">
            {currentPath && (
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-[#656358] hover:text-[#29261b] hover:bg-[#e8e5de]"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenInFinder();
                }}
                title={t.panel.openInFinder}
              >
                <ExternalLink className="h-3 w-3" />
              </Button>
            )}
            <ChevronDown
              className={cn(
                'h-4 w-4 text-[#8b887c] transition-transform',
                !expanded && '-rotate-90'
              )}
            />
          </div>
        </div>

        {expanded && (
          <>
            {currentPath ? (
          <div className="space-y-2 mt-3">
            {/* Folder card with dropdown */}
            <div ref={dropdownRef} className="relative">
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-full flex items-center gap-2.5 p-2.5 rounded-lg bg-white hover:bg-[#faf9f7] transition-colors text-left group shadow-sm"
              >
                <div className="w-8 h-8 rounded-md bg-[#d97757]/10 flex items-center justify-center shrink-0">
                  <FolderOpen className="w-4 h-4 text-[#d97757]" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[13px] font-medium text-[#29261b] truncate block">
                    {folderName}
                  </span>
                  <div className="text-[10px] text-[#888579] truncate">
                    {currentPath}
                  </div>
                </div>
                <ChevronDown className={`w-3.5 h-3.5 text-[#888579] transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown menu */}
              {isDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-lg border border-[#e8e5de] shadow-lg z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                  {/* Recent folders */}
                  {recentPaths.length > 0 && (
                    <>
                      <div className="px-3 py-2 text-[10px] font-medium text-[#888579] uppercase tracking-wider border-b border-[#f0ede6]">
                        {t.panel.recentlyUsed}
                      </div>
                      <div className="py-1 max-h-[200px] overflow-y-auto">
                        {recentPaths.map((path) => (
                          <button
                            key={path}
                            onClick={() => handleSelectRecent(path)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#f5f3ee] transition-colors"
                          >
                            <div className="w-4 h-4 flex items-center justify-center shrink-0">
                              {path === currentPath && (
                                <Check className="h-3.5 w-3.5 text-[#d97757]" />
                              )}
                            </div>
                            <Folder className={`h-3.5 w-3.5 shrink-0 ${path === currentPath ? 'text-[#d97757]' : 'text-[#888579]'}`} />
                            <span className={`text-[12px] truncate ${path === currentPath ? 'text-[#29261b] font-medium' : 'text-[#3d3929]'}`}>
                              {getFolderName(path)}
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  {/* Separator */}
                  {recentPaths.length > 0 && <div className="border-t border-[#f0ede6]" />}

                  {/* Choose different folder */}
                  <div className="py-1">
                    <button
                      onClick={handleSelectWorkspace}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#f5f3ee] transition-colors"
                    >
                      <div className="w-4 h-4" />
                      <Folder className="h-3.5 w-3.5 text-[#656358] shrink-0" />
                      <span className="text-[12px] text-[#656358]">
                        {t.panel.selectOtherFolder}
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* CLAUDE.md indicator */}
            {hasClaudeMd && (
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-green-500/10 border border-green-500/20">
                <FileText className="w-3.5 h-3.5 text-green-600" />
                <span className="text-[11px] text-green-700 font-medium">
                  {t.panel.instructionFile} · CLAUDE.md
                </span>
              </div>
            )}
          </div>
        ) : (
          // Empty state - clickable to select workspace
          <button
            onClick={handleSelectWorkspace}
            className="text-[12px] text-[#8b887c] hover:text-[#d97757] py-2 mt-3 cursor-pointer transition-colors text-left"
          >
            {t.panel.selectWorkspace}
          </button>
        )}

            {/* Operated files - always shown */}
            <FilesSection />
          </>
        )}
      </div>
    </>
  );
}

