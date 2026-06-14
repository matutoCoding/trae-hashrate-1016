import { Activity } from 'lucide-react';
import { useStageStore } from '@/store/stageStore';

export default function TopBar() {
  const { rings, activeAlertIds } = useStageStore();

  return (
    <header
      className="fixed top-0 right-0 z-30 h-16 flex items-center justify-between px-6"
      style={{
        left: 220,
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div className="flex items-center gap-3">
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>转台环数</span>
        <span className="font-mono-value font-semibold text-lg" style={{ color: 'var(--accent)' }}>
          {rings.length}
        </span>
      </div>

      <div className="flex items-center gap-4">
        {activeAlertIds.length > 0 && (
          <div
            className="flex items-center gap-2 px-3 py-1 rounded-full animate-pulse-danger"
            style={{ backgroundColor: 'var(--warning-dim)', color: 'var(--warning)' }}
          >
            <Activity size={14} />
            <span className="text-xs font-semibold">{activeAlertIds.length} 告警</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--accent)' }} />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>系统就绪</span>
        </div>
      </div>
    </header>
  );
}
