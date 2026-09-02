import { create } from 'zustand';
import { QUESTS, type PlayerProgress, type QuestDef, type QuestProgress } from '@mini-arcade/shared';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';

export interface QuestView extends QuestProgress {
  def: QuestDef;
}

interface ProgressionState {
  progress: PlayerProgress | null;
  questDefs: QuestDef[];
  loading: boolean;
  load: () => Promise<void>;
  subscribe: () => void;
  quests: () => QuestView[];
}

let subscribed = false;

export const useProgression = create<ProgressionState>((set, get) => ({
  progress: null,
  questDefs: [],
  loading: false,

  async load() {
    if (get().loading) return;
    set({ loading: true });
    try {
      const [{ progress }, today] = await Promise.all([api.progress(), api.questsToday().catch(() => null)]);
      set({ progress, questDefs: today?.definitions ?? [] });
    } catch {
      // Progression is a nice-to-have; never block the arcade on it.
    } finally {
      set({ loading: false });
    }
  },

  subscribe() {
    if (subscribed) return;
    subscribed = true;
    getSocket().on('progress:update', ({ progress }) => set({ progress }));
  },

  quests() {
    const progress = get().progress;
    if (!progress) return [];
    return progress.quests.map((quest) => ({ ...quest, def: QUESTS[quest.id] }));
  },
}));
