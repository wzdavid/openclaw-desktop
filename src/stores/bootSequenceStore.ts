import { create } from 'zustand';

export type BootStageId = 'connection' | 'config' | 'conversation' | 'background';
export type BootStageStatus = 'pending' | 'running' | 'completed' | 'skipped' | 'error';

export interface BootStage {
  id: BootStageId;
  title: string;
  status: BootStageStatus;
  detail: string;
  updatedAt: number;
}

interface BootSequenceState {
  cycle: number;
  activeStage: BootStageId | null;
  stages: Record<BootStageId, BootStage>;
  reset: () => number;
  markStageRunning: (id: BootStageId, detail?: string) => void;
  markStageCompleted: (id: BootStageId, detail?: string) => void;
  markStageError: (id: BootStageId, detail?: string) => void;
}

const STAGE_ORDER: BootStageId[] = ['connection', 'config', 'conversation', 'background'];

function createDefaultStages(): Record<BootStageId, BootStage> {
  const now = Date.now();
  return {
    connection: {
      id: 'connection',
      title: 'Connection',
      status: 'pending',
      detail: 'Waiting for WebSocket handshake',
      updatedAt: now,
    },
    config: {
      id: 'config',
      title: 'Configuration',
      status: 'pending',
      detail: 'Waiting for models / config / cron',
      updatedAt: now,
    },
    conversation: {
      id: 'conversation',
      title: 'Conversation',
      status: 'pending',
      detail: 'Waiting for recent history and sessions.list',
      updatedAt: now,
    },
    background: {
      id: 'background',
      title: 'Background sync',
      status: 'pending',
      detail: 'Waiting for cost / usage / agents',
      updatedAt: now,
    },
  };
}

function getNextActiveStage(stages: Record<BootStageId, BootStage>): BootStageId | null {
  for (const id of STAGE_ORDER) {
    const status = stages[id].status;
    if (status === 'running' || status === 'pending') {
      return id;
    }
  }
  return null;
}

function updateStage(
  current: Record<BootStageId, BootStage>,
  id: BootStageId,
  status: BootStageStatus,
  detail?: string,
): Record<BootStageId, BootStage> {
  return {
    ...current,
    [id]: {
      ...current[id],
      status,
      detail: detail ?? current[id].detail,
      updatedAt: Date.now(),
    },
  };
}

export function getBootProgressSummary(stages: Record<BootStageId, BootStage>) {
  const list = STAGE_ORDER.map((id) => stages[id]);
  const completed = list.filter((stage) => stage.status === 'completed' || stage.status === 'skipped').length;
  const total = list.length;
  const active = list.find((stage) => stage.status === 'running')
    ?? list.find((stage) => stage.status === 'pending')
    ?? null;
  return { completed, total, active };
}

export const useBootSequenceStore = create<BootSequenceState>((set, get) => ({
  cycle: 0,
  activeStage: 'connection',
  stages: createDefaultStages(),

  reset: () => {
    const cycle = get().cycle + 1;
    const stages = createDefaultStages();
    set({ cycle, activeStage: 'connection', stages });
    return cycle;
  },

  markStageRunning: (id, detail) => set((state) => {
    const stages = updateStage(state.stages, id, 'running', detail);
    return { stages, activeStage: id };
  }),

  markStageCompleted: (id, detail) => set((state) => {
    const stages = updateStage(state.stages, id, 'completed', detail);
    return { stages, activeStage: getNextActiveStage(stages) };
  }),

  markStageError: (id, detail) => set((state) => {
    const stages = updateStage(state.stages, id, 'error', detail);
    return { stages, activeStage: id };
  }),
}));
