/**
 * Agent Memory — per-agent persistent memory
 *
 * Each agent has a memory.md file stored at:
 *   ~/.abu/agents/{agentName}/memory.md
 *
 * Memory is loaded into the agent system prompt and can be updated
 * by the agent via the update_memory tool (append / rewrite / clear).
 */

import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { homeDir } from '@tauri-apps/api/path';
import { ensureParentDir, joinPath } from '../../utils/pathUtils';

const MAX_MEMORY_CHARS = 4000; // Limit memory size to prevent context bloat

// Cache homeDir to avoid repeated IPC calls
let cachedHomeDir: string | null = null;

async function getCachedHomeDir(): Promise<string> {
  if (!cachedHomeDir) {
    cachedHomeDir = await homeDir();
  }
  return cachedHomeDir;
}

/**
 * Get the memory file path for an agent
 */
async function getMemoryPath(agentName: string): Promise<string> {
  const home = await getCachedHomeDir();
  return joinPath(home, '.abu', 'agents', agentName, 'memory.md');
}

/**
 * Read raw memory content from disk without truncation (for internal write operations).
 */
async function readRawMemory(agentName: string): Promise<string> {
  try {
    const memoryPath = await getMemoryPath(agentName);
    return await readTextFile(memoryPath);
  } catch {
    return '';
  }
}

/**
 * Load agent memory from disk. Returns empty string if no memory exists.
 * Truncates for prompt injection — does NOT modify the file on disk.
 */
export async function loadAgentMemory(agentName: string): Promise<string> {
  const content = await readRawMemory(agentName);
  if (!content) return '';
  // Truncate if too large (for prompt injection only)
  if (content.length > MAX_MEMORY_CHARS) {
    return content.slice(0, MAX_MEMORY_CHARS) + '\n...(记忆已截断)';
  }
  return content;
}

/**
 * Save agent memory to disk. Overwrites existing memory.
 */
export async function saveAgentMemory(agentName: string, content: string): Promise<void> {
  const memoryPath = await getMemoryPath(agentName);
  await ensureParentDir(memoryPath);
  // Truncate if too large
  const truncated = content.length > MAX_MEMORY_CHARS
    ? content.slice(0, MAX_MEMORY_CHARS)
    : content;
  await writeTextFile(memoryPath, truncated);
}

/**
 * Append to agent memory (adds to the end of existing memory)
 */
export async function appendAgentMemory(agentName: string, newContent: string): Promise<string> {
  const existing = await readRawMemory(agentName);
  const updated = existing
    ? `${existing}\n\n${newContent}`
    : newContent;
  await saveAgentMemory(agentName, updated);
  return updated;
}

/**
 * Clear agent memory
 */
export async function clearAgentMemory(agentName: string): Promise<void> {
  await saveAgentMemory(agentName, '');
}
