import { create } from 'zustand';
import type {
  TurntableRing,
  LiftPlatform,
  MotionScript,
  Scene,
  MotionSegment,
  SyncError,
  SyncThreshold,
  Template,
} from '@/types';

interface StageStore {
  rings: TurntableRing[];
  lifts: LiftPlatform[];
  scripts: MotionScript[];
  currentScriptId: string | null;
  syncThreshold: SyncThreshold;
  syncErrors: SyncError[];
  templates: Template[];
  activeAlertIds: string[];

  addRing: (ring: TurntableRing) => void;
  updateRing: (id: string, ring: Partial<TurntableRing>) => void;
  removeRing: (id: string) => void;
  setRings: (rings: TurntableRing[]) => void;

  addLift: (lift: LiftPlatform) => void;
  updateLift: (id: string, lift: Partial<LiftPlatform>) => void;
  removeLift: (id: string) => void;

  addScript: (script: MotionScript) => void;
  updateScript: (id: string, script: Partial<MotionScript>) => void;
  removeScript: (id: string) => void;
  setCurrentScriptId: (id: string | null) => void;
  getCurrentScript: () => MotionScript | null;

  addScene: (scriptId: string, scene: Scene) => void;
  updateScene: (scriptId: string, sceneId: string, scene: Partial<Scene>) => void;
  removeScene: (scriptId: string, sceneId: string) => void;

  addMotionSegment: (scriptId: string, sceneId: string, segment: MotionSegment) => void;
  updateMotionSegment: (scriptId: string, sceneId: string, segmentId: string, segment: Partial<MotionSegment>) => void;
  removeMotionSegment: (scriptId: string, sceneId: string, segmentId: string) => void;

  setSyncThreshold: (threshold: SyncThreshold) => void;
  addSyncError: (error: SyncError) => void;
  clearSyncErrors: () => void;

  addTemplate: (template: Template) => void;
  updateTemplate: (id: string, template: Partial<Template>) => void;
  removeTemplate: (id: string) => void;

  addActiveAlert: (id: string) => void;
  removeActiveAlert: (id: string) => void;
  clearActiveAlerts: () => void;
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage<T>(key: string, data: T) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {}
}

const storageKeys = {
  rings: 'stagerig_rings',
  lifts: 'stagerig_lifts',
  scripts: 'stagerig_scripts',
  templates: 'stagerig_templates',
  syncThreshold: 'stagerig_syncThreshold',
};

export const useStageStore = create<StageStore>((set, get) => ({
  rings: loadFromStorage<TurntableRing[]>(storageKeys.rings, []),
  lifts: loadFromStorage<LiftPlatform[]>(storageKeys.lifts, []),
  scripts: loadFromStorage<MotionScript[]>(storageKeys.scripts, []),
  currentScriptId: null,
  syncThreshold: loadFromStorage<SyncThreshold>(storageKeys.syncThreshold, {
    angleError: 0.5,
    timeError: 50,
    stutterThreshold: 3,
  }),
  syncErrors: [],
  templates: loadFromStorage<Template[]>(storageKeys.templates, []),
  activeAlertIds: [],

  addRing: (ring) => {
    const rings = [...get().rings, ring];
    set({ rings });
    saveToStorage(storageKeys.rings, rings);
  },
  updateRing: (id, update) => {
    const rings = get().rings.map((r) => (r.id === id ? { ...r, ...update } : r));
    set({ rings });
    saveToStorage(storageKeys.rings, rings);
  },
  removeRing: (id) => {
    const rings = get().rings.filter((r) => r.id !== id);
    set({ rings });
    saveToStorage(storageKeys.rings, rings);
  },
  setRings: (rings) => {
    set({ rings });
    saveToStorage(storageKeys.rings, rings);
  },

  addLift: (lift) => {
    const lifts = [...get().lifts, lift];
    set({ lifts });
    saveToStorage(storageKeys.lifts, lifts);
  },
  updateLift: (id, update) => {
    const lifts = get().lifts.map((l) => (l.id === id ? { ...l, ...update } : l));
    set({ lifts });
    saveToStorage(storageKeys.lifts, lifts);
  },
  removeLift: (id) => {
    const lifts = get().lifts.filter((l) => l.id !== id);
    set({ lifts });
    saveToStorage(storageKeys.lifts, lifts);
  },

  addScript: (script) => {
    const scripts = [...get().scripts, script];
    set({ scripts });
    saveToStorage(storageKeys.scripts, scripts);
  },
  updateScript: (id, update) => {
    const scripts = get().scripts.map((s) =>
      s.id === id ? { ...s, ...update, updatedAt: Date.now() } : s
    );
    set({ scripts });
    saveToStorage(storageKeys.scripts, scripts);
  },
  removeScript: (id) => {
    const scripts = get().scripts.filter((s) => s.id !== id);
    set({ scripts, currentScriptId: get().currentScriptId === id ? null : get().currentScriptId });
    saveToStorage(storageKeys.scripts, scripts);
  },
  setCurrentScriptId: (id) => set({ currentScriptId: id }),
  getCurrentScript: () => {
    const { scripts, currentScriptId } = get();
    return scripts.find((s) => s.id === currentScriptId) ?? null;
  },

  addScene: (scriptId, scene) => {
    const scripts = get().scripts.map((s) =>
      s.id === scriptId ? { ...s, scenes: [...s.scenes, scene], updatedAt: Date.now() } : s
    );
    set({ scripts });
    saveToStorage(storageKeys.scripts, scripts);
  },
  updateScene: (scriptId, sceneId, scene) => {
    const scripts = get().scripts.map((s) =>
      s.id === scriptId
        ? {
            ...s,
            scenes: s.scenes.map((sc) => (sc.id === sceneId ? { ...sc, ...scene } : sc)),
            updatedAt: Date.now(),
          }
        : s
    );
    set({ scripts });
    saveToStorage(storageKeys.scripts, scripts);
  },
  removeScene: (scriptId, sceneId) => {
    const scripts = get().scripts.map((s) =>
      s.id === scriptId
        ? { ...s, scenes: s.scenes.filter((sc) => sc.id !== sceneId), updatedAt: Date.now() }
        : s
    );
    set({ scripts });
    saveToStorage(storageKeys.scripts, scripts);
  },

  addMotionSegment: (scriptId, sceneId, segment) => {
    const scripts = get().scripts.map((s) =>
      s.id === scriptId
        ? {
            ...s,
            scenes: s.scenes.map((sc) =>
              sc.id === sceneId
                ? { ...sc, motionSegments: [...sc.motionSegments, segment] }
                : sc
            ),
            updatedAt: Date.now(),
          }
        : s
    );
    set({ scripts });
    saveToStorage(storageKeys.scripts, scripts);
  },
  updateMotionSegment: (scriptId, sceneId, segmentId, segment) => {
    const scripts = get().scripts.map((s) =>
      s.id === scriptId
        ? {
            ...s,
            scenes: s.scenes.map((sc) =>
              sc.id === sceneId
                ? {
                    ...sc,
                    motionSegments: sc.motionSegments.map((ms) =>
                      ms.id === segmentId ? { ...ms, ...segment } : ms
                    ),
                  }
                : sc
            ),
            updatedAt: Date.now(),
          }
        : s
    );
    set({ scripts });
    saveToStorage(storageKeys.scripts, scripts);
  },
  removeMotionSegment: (scriptId, sceneId, segmentId) => {
    const scripts = get().scripts.map((s) =>
      s.id === scriptId
        ? {
            ...s,
            scenes: s.scenes.map((sc) =>
              sc.id === sceneId
                ? {
                    ...sc,
                    motionSegments: sc.motionSegments.filter((ms) => ms.id !== segmentId),
                  }
                : sc
            ),
            updatedAt: Date.now(),
          }
        : s
    );
    set({ scripts });
    saveToStorage(storageKeys.scripts, scripts);
  },

  setSyncThreshold: (threshold) => {
    set({ syncThreshold: threshold });
    saveToStorage(storageKeys.syncThreshold, threshold);
  },
  addSyncError: (error) => set((s) => ({ syncErrors: [...s.syncErrors, error] })),
  clearSyncErrors: () => set({ syncErrors: [] }),

  addTemplate: (template) => {
    const templates = [...get().templates, template];
    set({ templates });
    saveToStorage(storageKeys.templates, templates);
  },
  updateTemplate: (id, update) => {
    const templates = get().templates.map((t) =>
      t.id === id ? { ...t, ...update, updatedAt: Date.now() } : t
    );
    set({ templates });
    saveToStorage(storageKeys.templates, templates);
  },
  removeTemplate: (id) => {
    const templates = get().templates.filter((t) => t.id !== id);
    set({ templates });
    saveToStorage(storageKeys.templates, templates);
  },

  addActiveAlert: (id) => set((s) => ({ activeAlertIds: s.activeAlertIds.includes(id) ? s.activeAlertIds : [...s.activeAlertIds, id] })),
  removeActiveAlert: (id) => set((s) => ({ activeAlertIds: s.activeAlertIds.filter((a) => a !== id) })),
  clearActiveAlerts: () => set({ activeAlertIds: [] }),
}));
