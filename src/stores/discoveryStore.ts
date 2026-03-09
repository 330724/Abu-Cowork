import { create } from 'zustand';
import type { SkillMetadata, SubagentMetadata } from '../types';
import { skillLoader } from '../core/skill/loader';
import { agentRegistry } from '../core/agent/registry';

interface DiscoveryState {
  skills: SkillMetadata[];
  agents: SubagentMetadata[];
  isLoading: boolean;
}

interface DiscoveryActions {
  refresh: () => Promise<void>;
}

export type DiscoveryStore = DiscoveryState & DiscoveryActions;

export const useDiscoveryStore = create<DiscoveryStore>()((set) => ({
  skills: [],
  agents: [],
  isLoading: false,

  refresh: async () => {
    set({ isLoading: true });
    try {
      const [skills, agents] = await Promise.all([
        skillLoader.discoverSkills(),
        agentRegistry.discoverAgents(),
      ]);
      set({ skills, agents, isLoading: false });
    } catch (err) {
      console.warn('Discovery refresh failed:', err);
      set({ isLoading: false });
    }
  },
}));
