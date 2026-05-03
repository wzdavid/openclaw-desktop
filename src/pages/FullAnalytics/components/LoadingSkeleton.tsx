// ═══════════════════════════════════════════════════════════
// LoadingSkeleton — Pulse placeholder shown during initial load
// ═══════════════════════════════════════════════════════════

export function LoadingSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      {/* 5 overview cards */}
      <div className="grid grid-cols-5 gap-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-[rgb(var(--aegis-overlay)/0.06)] bg-[rgb(var(--aegis-overlay)/0.02)] p-5"
          >
            <div className="flex flex-col items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-[rgb(var(--aegis-overlay)/0.04)]" />
              <div className="w-20 h-7 rounded-lg bg-[rgb(var(--aegis-overlay)/0.04)]" />
              <div className="w-16 h-2 rounded bg-[rgb(var(--aegis-overlay)/0.03)]" />
            </div>
          </div>
        ))}
      </div>

      {/* Token breakdown */}
      <div className="rounded-2xl border border-[rgb(var(--aegis-overlay)/0.06)] bg-[rgb(var(--aegis-overlay)/0.02)] p-5">
        <div className="w-32 h-3 rounded bg-[rgb(var(--aegis-overlay)/0.04)] mb-4" />
        <div className="h-4 rounded-full bg-[rgb(var(--aegis-overlay)/0.04)] mb-4" />
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-[rgb(var(--aegis-overlay)/0.03)]" />
          ))}
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-5 gap-4">
        <div className="col-span-3 rounded-2xl border border-[rgb(var(--aegis-overlay)/0.06)] bg-[rgb(var(--aegis-overlay)/0.02)] p-5">
          <div className="w-24 h-3 rounded bg-[rgb(var(--aegis-overlay)/0.04)] mb-4" />
          <div className="h-[200px] rounded-lg bg-[rgb(var(--aegis-overlay)/0.03)]" />
        </div>
        <div className="col-span-2 rounded-2xl border border-[rgb(var(--aegis-overlay)/0.06)] bg-[rgb(var(--aegis-overlay)/0.02)] p-5">
          <div className="w-24 h-3 rounded bg-[rgb(var(--aegis-overlay)/0.04)] mb-4" />
          <div className="h-[200px] rounded-full bg-[rgb(var(--aegis-overlay)/0.03)]" />
        </div>
      </div>
    </div>
  );
}
