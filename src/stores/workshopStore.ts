import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ═══════════════════════════════════════════════════════════
// Workshop Store — Kanban tasks + Activity Log
// ═══════════════════════════════════════════════════════════

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  status: 'queue' | 'inProgress' | 'done';
  createdAt: string;
  completedAt?: string;
  tags: string[];
  assignedAgent?: string;
  progress?: number; // 0-100, for inProgress tasks
}

export interface ActivityEntry {
  id: string;
  type: 'created' | 'moved' | 'progress' | 'deleted' | 'completed';
  taskTitle: string;
  agent?: string;
  from?: string;
  to?: string;
  progress?: number;
  timestamp: string;
}

interface WorkshopState {
  tasks: Task[];
  activities: ActivityEntry[];
  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'status' | 'tags'> & { tags?: string[] }) => void;
  moveTask: (id: string, status: Task['status']) => void;
  deleteTask: (id: string) => void;
  reorderInColumn: (status: Task['status'], orderedIds: string[]) => void;
  setProgress: (id: string, progress: number) => void;
  updateTask: (id: string, updates: Partial<Pick<Task, 'title' | 'description' | 'priority' | 'tags' | 'assignedAgent'>>) => void;
  clearCompleted: () => void;
}

const MAX_ACTIVITIES = 50;

function makeActivity(
  type: ActivityEntry['type'],
  taskTitle: string,
  extra?: Partial<ActivityEntry>,
): ActivityEntry {
  return {
    id: crypto.randomUUID(),
    type,
    taskTitle,
    timestamp: new Date().toISOString(),
    ...extra,
  };
}

const STATUS_LABELS: Record<string, string> = {
  queue: 'Queue',
  inProgress: 'In Progress',
  done: 'Done',
};

export const useWorkshopStore = create<WorkshopState>()(
  persist(
    (set, get) => ({
      tasks: [],
      activities: [],

      addTask: (partial) => set((state) => {
        const task: Task = {
          ...partial,
          id: crypto.randomUUID(),
          status: 'queue',
          createdAt: new Date().toISOString(),
          tags: partial.tags || [],
        };
        return {
          tasks: [...state.tasks, task],
          activities: [
            makeActivity('created', task.title, { agent: task.assignedAgent }),
            ...state.activities,
          ].slice(0, MAX_ACTIVITIES),
        };
      }),

      moveTask: (id, status) => set((state) => {
        const task = state.tasks.find((t) => t.id === id);
        if (!task || task.status === status) return state;
        const fromLabel = STATUS_LABELS[task.status] || task.status;
        const toLabel = STATUS_LABELS[status] || status;
        const isCompleting = status === 'done';
        return {
          tasks: state.tasks.map((t) =>
            t.id === id
              ? { ...t, status, ...(isCompleting ? { completedAt: new Date().toISOString(), progress: 100 } : {}) }
              : t,
          ),
          activities: [
            makeActivity(
              isCompleting ? 'completed' : 'moved',
              task.title,
              { from: fromLabel, to: toLabel, agent: task.assignedAgent },
            ),
            ...state.activities,
          ].slice(0, MAX_ACTIVITIES),
        };
      }),

      deleteTask: (id) => set((state) => {
        const task = state.tasks.find((t) => t.id === id);
        if (!task) return state;
        return {
          tasks: state.tasks.filter((t) => t.id !== id),
          activities: [
            makeActivity('deleted', task.title, { agent: task.assignedAgent }),
            ...state.activities,
          ].slice(0, MAX_ACTIVITIES),
        };
      }),

      setProgress: (id, progress) => set((state) => {
        const task = state.tasks.find((t) => t.id === id);
        if (!task) return state;
        return {
          tasks: state.tasks.map((t) => t.id === id ? { ...t, progress } : t),
          activities: [
            makeActivity('progress', task.title, { progress, agent: task.assignedAgent }),
            ...state.activities,
          ].slice(0, MAX_ACTIVITIES),
        };
      }),

      updateTask: (id, updates) => set((state) => ({
        tasks: state.tasks.map((t) => t.id === id ? { ...t, ...updates } : t),
      })),

      clearCompleted: () => set((state) => ({
        tasks: state.tasks.filter((t) => t.status !== 'done'),
      })),

      reorderInColumn: (status, orderedIds) => set((state) => {
        const others = state.tasks.filter((t) => t.status !== status);
        const columnTasks = orderedIds
          .map((id) => state.tasks.find((t) => t.id === id))
          .filter(Boolean) as Task[];
        return { tasks: [...others, ...columnTasks] };
      }),
    }),
    { name: 'aegis-workshop-tasks' },
  ),
);
