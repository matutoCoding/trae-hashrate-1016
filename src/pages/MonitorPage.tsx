import { useState, useRef, useEffect, useCallback } from 'react';
import { useStageStore } from '@/store/stageStore';
import { RING_COLORS, type SyncError, type SyncThreshold } from '@/types';
import { angularPositionAt, rpmToRadPerSec } from '@/utils/physics';
import {
  Activity,
  Play,
  Pause,
  Square,
  Volume2,
  VolumeX,
  Bell,
  BellOff,
  Settings2,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';

function GaugeCanvas({
  value,
  maxValue,
  label,
  color,
  thresholds,
}: {
  value: number;
  maxValue: number;
  label: string;
  color: string;
  thresholds: { warn: number; danger: number };
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = 200 * dpr;
    canvas.height = 130 * dpr;
    canvas.style.width = '200px';
    canvas.style.height = '130px';
    ctx.scale(dpr, dpr);

    const cx = 100;
    const cy = 110;
    const r = 80;
    const startAngle = Math.PI;
    const endAngle = 2 * Math.PI;

    ctx.clearRect(0, 0, 200, 130);

    const dangerAngle = startAngle + (thresholds.danger / maxValue) * Math.PI;
    const warnAngle = startAngle + (thresholds.warn / maxValue) * Math.PI;

    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, endAngle);
    ctx.strokeStyle = 'rgba(45, 53, 72, 0.4)';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, r, warnAngle, endAngle);
    ctx.strokeStyle = 'rgba(0, 212, 170, 0.3)';
    ctx.lineWidth = 12;
    ctx.lineCap = 'butt';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, r, dangerAngle, warnAngle);
    ctx.strokeStyle = 'rgba(255, 140, 0, 0.3)';
    ctx.lineWidth = 12;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, dangerAngle);
    ctx.strokeStyle = 'rgba(255, 59, 59, 0.3)';
    ctx.lineWidth = 12;
    ctx.stroke();

    const clampedValue = Math.min(value, maxValue);
    const valueAngle = startAngle + (clampedValue / maxValue) * Math.PI;
    const valueColor = value >= thresholds.danger ? '#FF3B3B' : value >= thresholds.warn ? '#FF8C00' : color;

    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, valueAngle);
    ctx.strokeStyle = valueColor;
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.stroke();

    const needleLen = r - 20;
    const nx = cx + needleLen * Math.cos(valueAngle);
    const ny = cy + needleLen * Math.sin(valueAngle);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(nx, ny);
    ctx.strokeStyle = valueColor;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = valueColor;
    ctx.fill();

    ctx.fillStyle = valueColor;
    ctx.font = 'bold 20px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(value.toFixed(2), cx, cy - 20);

    ctx.fillStyle = '#6E7681';
    ctx.font = '11px "Source Sans 3", sans-serif';
    ctx.fillText(label, cx, cy - 4);
  }, [value, maxValue, label, color, thresholds]);

  return <canvas ref={canvasRef} />;
}

function TrendChart({
  data,
  ringColors,
  ringIds,
  maxValue,
  label,
}: {
  data: Record<string, { t: number; v: number }[]>;
  ringColors: Record<string, string>;
  ringIds: string[];
  maxValue: number;
  label: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.parentElement?.clientWidth ?? 600;
    const h = 200;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);

    const pad = { t: 20, r: 20, b: 30, l: 50 };
    const pW = w - pad.l - pad.r;
    const pH = h - pad.t - pad.b;

    ctx.fillStyle = '#0D1117';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(45, 53, 72, 0.5)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (pH * i) / 4;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(w - pad.r, y);
      ctx.stroke();
    }

    let maxT = 0;
    for (const id of ringIds) {
      const pts = data[id] || [];
      if (pts.length > 0) maxT = Math.max(maxT, pts[pts.length - 1].t);
    }
    if (maxT === 0) maxT = 10;

    for (const id of ringIds) {
      const pts = data[id] || [];
      if (pts.length < 2) continue;

      ctx.beginPath();
      ctx.strokeStyle = ringColors[id] || '#00D4AA';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < pts.length; i++) {
        const x = pad.l + (pts[i].t / maxT) * pW;
        const y = pad.t + pH - (Math.min(pts[i].v, maxValue) / maxValue) * pH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    ctx.strokeStyle = '#2D3548';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t);
    ctx.lineTo(pad.l, h - pad.b);
    ctx.lineTo(w - pad.r, h - pad.b);
    ctx.stroke();

    ctx.fillStyle = '#6E7681';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(maxValue.toFixed(1), pad.l - 4, pad.t + 4);
    ctx.fillText('0', pad.l - 4, h - pad.b + 4);
    ctx.textAlign = 'center';
    ctx.fillText(label, w / 2, h - 4);
  }, [data, ringColors, ringIds, maxValue, label]);

  return <canvas ref={canvasRef} />;
}

export default function MonitorPage() {
  const {
    rings,
    scripts,
    currentScriptId,
    setCurrentScriptId,
    syncThreshold,
    setSyncThreshold,
    syncErrors,
    addSyncError,
    clearSyncErrors,
    activeAlertIds,
    addActiveAlert,
    removeActiveAlert,
  } = useStageStore();

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [muted, setMuted] = useState(false);
  const [localAlerts, setLocalAlerts] = useState<SyncError[]>([]);
  const [angleTrend, setAngleTrend] = useState<Record<string, { t: number; v: number }[]>>({});
  const [timeTrend, setTimeTrend] = useState<Record<string, { t: number; v: number }[]>>({});
  const [ringErrors, setRingErrors] = useState<Record<string, { angleError: number; timeError: number; status: 'ok' | 'warn' | 'danger'; isStutter: boolean; isJitter: boolean }>>({});

  const currentScript = scripts.find((s) => s.id === currentScriptId) ?? null;
  const playDuration = currentScript
    ? Math.max(...currentScript.scenes.map((s) => s.endTime), 10)
    : 60;

  const ringColorMap = useCallback((): Record<string, string> => {
    const m: Record<string, string> = {};
    rings.forEach((r, i) => {
      m[r.id] = RING_COLORS[i % RING_COLORS.length];
    });
    return m;
  }, [rings]);

  useEffect(() => {
    if (!playing || !currentScript) return;

    const interval = setInterval(() => {
      setCurrentTime((prev) => {
        const next = prev + 0.05;
        if (next >= playDuration) {
          setPlaying(false);
          return 0;
        }
        return next;
      });
    }, 50);

    return () => clearInterval(interval);
  }, [playing, currentScript, playDuration]);

  useEffect(() => {
    if (!currentScript || !playing) return;

    const newErrors: Record<string, { angleError: number; timeError: number; status: 'ok' | 'warn' | 'danger'; isStutter: boolean; isJitter: boolean }> = {};
    const newAngleTrend: Record<string, { t: number; v: number }[]> = {};
    const newTimeTrend: Record<string, { t: number; v: number }[]> = {};

    for (const ring of rings) {
      const segs: typeof currentScript.scenes[0]['motionSegments'] = [];
      for (const scene of currentScript.scenes) {
        for (const seg of scene.motionSegments) {
          if (seg.ringId === ring.id) segs.push(seg);
        }
      }

      let idealAngle = ring.initialAngle;
      for (const seg of segs) {
        if (currentTime >= seg.startTime && currentTime <= seg.endTime) {
          idealAngle = angularPositionAt(currentTime, seg, ring.initialAngle);
          break;
        }
      }

      const noiseScale = 0.02 + Math.random() * 0.03;
      const angleError = (Math.random() - 0.5) * 2 * syncThreshold.angleError * noiseScale * 10;
      const timeError = (Math.random() - 0.5) * 2 * syncThreshold.timeError * noiseScale * 10;

      const isStutter = Math.random() < 0.003;
      const isJitter = Math.random() < 0.005;

      const effectiveAngleError = isStutter ? angleError * 5 : angleError;
      const effectiveTimeError = isJitter ? timeError * 5 : timeError;

      let status: 'ok' | 'warn' | 'danger' = 'ok';
      if (Math.abs(effectiveAngleError) >= syncThreshold.angleError || Math.abs(effectiveTimeError) >= syncThreshold.timeError) {
        status = 'danger';
      } else if (Math.abs(effectiveAngleError) >= syncThreshold.angleError * 0.6 || Math.abs(effectiveTimeError) >= syncThreshold.timeError * 0.6) {
        status = 'warn';
      }

      newErrors[ring.id] = {
        angleError: effectiveAngleError,
        timeError: effectiveTimeError,
        status,
        isStutter,
        isJitter,
      };

      newAngleTrend[ring.id] = [
        ...(angleTrend[ring.id] || []).slice(-200),
        { t: currentTime, v: Math.abs(effectiveAngleError) },
      ];
      newTimeTrend[ring.id] = [
        ...(timeTrend[ring.id] || []).slice(-200),
        { t: currentTime, v: Math.abs(effectiveTimeError) },
      ];

      if (status === 'danger' || isStutter || isJitter) {
        const alertId = `${ring.id}-${Date.now()}`;
        const err: SyncError = {
          ringId: ring.id,
          timestamp: Date.now(),
          angleError: effectiveAngleError,
          timeError: effectiveTimeError,
          isStutter,
          isJitter,
        };
        addSyncError(err);
        addActiveAlert(alertId);

        setLocalAlerts((prev) => [
          { ...err, id: alertId } as SyncError & { id: string },
          ...prev,
        ].slice(0, 50));
      }
    }

    setRingErrors(newErrors);
    setAngleTrend(newAngleTrend);
    setTimeTrend(newTimeTrend);
  }, [currentTime]);

  const handleStop = () => {
    setPlaying(false);
    setCurrentTime(0);
    clearSyncErrors();
    setLocalAlerts([]);
    setAngleTrend({});
    setTimeTrend({});
    setRingErrors({});
  };

  const handleReplay = () => {
    setCurrentTime(0);
    clearSyncErrors();
    setLocalAlerts([]);
    setAngleTrend({});
    setTimeTrend({});
    setRingErrors({});
    setPlaying(true);
  };

  const acknowledgeAlert = (idx: number) => {
    setLocalAlerts((prev) => prev.filter((_, i) => i !== idx));
  };

  const colors = ringColorMap();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minHeight: 'calc(100vh - 7rem)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Activity size={28} style={{ color: 'var(--accent)' }} />
          <div>
            <h1 className="font-display" style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              同步监控
            </h1>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
              舞台转台工业控制系统 · 实时同步误差监控与告警
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select
            value={currentScriptId || ''}
            onChange={(e) => setCurrentScriptId(e.target.value || null)}
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              borderRadius: 6,
              padding: '6px 10px',
              fontSize: 13,
              outline: 'none',
            }}
          >
            <option value="">选择脚本...</option>
            {scripts.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          <button
            onClick={() => playing ? setPlaying(false) : setPlaying(true)}
            disabled={!currentScript}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 8,
              backgroundColor: playing ? 'var(--accent-dim)' : 'var(--accent)',
              border: `1px solid ${playing ? 'var(--accent)' : 'var(--accent)'}`,
              color: playing ? 'var(--accent)' : 'var(--bg-primary)',
              cursor: currentScript ? 'pointer' : 'not-allowed',
              fontWeight: 600,
              fontSize: 13,
              opacity: currentScript ? 1 : 0.4,
            }}
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
            {playing ? '暂停' : '播放'}
          </button>

          <button
            onClick={handleStop}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 8,
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            <Square size={14} />
            停止
          </button>

          <button
            onClick={handleReplay}
            disabled={!currentScript}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 8,
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              cursor: currentScript ? 'pointer' : 'not-allowed',
              fontWeight: 600,
              fontSize: 13,
              opacity: currentScript ? 1 : 0.4,
            }}
          >
            <RotateCcw size={14} />
            复演
          </button>

          <button
            onClick={() => setMuted(!muted)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '8px',
              borderRadius: 8,
              backgroundColor: muted ? 'var(--danger-dim)' : 'var(--bg-secondary)',
              border: `1px solid ${muted ? 'var(--danger)' : 'var(--border)'}`,
              color: muted ? 'var(--danger)' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </div>
      </div>

      <div
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderRadius: 8,
          border: '1px solid var(--border)',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <span className="font-mono-value" style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          时间
        </span>
        <div style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: 'var(--border)', position: 'relative', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              borderRadius: 3,
              backgroundColor: 'var(--accent)',
              width: `${(currentTime / playDuration) * 100}%`,
              transition: 'width 0.05s linear',
            }}
          />
        </div>
        <span className="font-mono-value" style={{ fontSize: 13, color: 'var(--accent)', minWidth: 100 }}>
          {currentTime.toFixed(1)}s / {playDuration.toFixed(1)}s
        </span>
      </div>

      {localAlerts.length > 0 && !muted && (
        <div
          className="animate-slide-in"
          style={{
            backgroundColor: 'var(--warning-dim)',
            border: '1px solid var(--warning)',
            borderRadius: 8,
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Bell size={16} style={{ color: 'var(--warning)' }} />
          <span style={{ color: 'var(--warning)', fontWeight: 600, fontSize: 13 }}>
            {localAlerts.length} 条活跃告警
          </span>
          <button
            onClick={() => { setLocalAlerts([]); clearSyncErrors(); }}
            style={{
              marginLeft: 'auto',
              padding: '4px 10px',
              borderRadius: 4,
              backgroundColor: 'var(--warning)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            全部确认
          </button>
        </div>
      )}

      {rings.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <Activity size={48} style={{ marginBottom: 12, opacity: 0.4 }} />
          <p>暂无转台环数据，请先在转台录入页添加</p>
        </div>
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${Math.min(rings.length, 4)}, 1fr)`,
              gap: 16,
            }}
          >
            {rings.map((ring, idx) => {
              const err = ringErrors[ring.id];
              const angleError = err?.angleError ?? 0;
              const timeError = err?.timeError ?? 0;
              const status = err?.status ?? 'ok';
              const isStutter = err?.isStutter ?? false;
              const isJitter = err?.isJitter ?? false;

              const statusColor = status === 'danger' ? 'var(--danger)' : status === 'warn' ? 'var(--warning)' : 'var(--accent)';
              const statusLabel = status === 'danger' ? '异常' : status === 'warn' ? '警告' : '正常';

              return (
                <div
                  key={ring.id}
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    borderRadius: 12,
                    border: `1px solid ${status === 'danger' ? 'var(--danger)' : status === 'warn' ? 'var(--warning)' : 'var(--border)'}`,
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                    <div
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        backgroundColor: RING_COLORS[idx % RING_COLORS.length],
                      }}
                    />
                    <span className="font-display" style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
                      {ring.name}
                    </span>
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {status === 'ok' && <CheckCircle2 size={14} style={{ color: 'var(--accent)' }} />}
                      {status === 'warn' && <AlertTriangle size={14} style={{ color: 'var(--warning)' }} />}
                      {status === 'danger' && <AlertTriangle size={14} className="animate-pulse-danger" style={{ color: 'var(--danger)' }} />}
                      <span style={{ fontSize: 12, fontWeight: 600, color: statusColor }}>{statusLabel}</span>
                    </div>
                  </div>

                  <GaugeCanvas
                    value={Math.abs(angleError)}
                    maxValue={syncThreshold.angleError * 2}
                    label="角度误差 (°)"
                    color={RING_COLORS[idx % RING_COLORS.length]}
                    thresholds={{ warn: syncThreshold.angleError * 0.6, danger: syncThreshold.angleError }}
                  />

                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '0 8px' }}>
                    <div>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>角度误差</span>
                      <div className="font-mono-value" style={{ fontSize: 14, fontWeight: 600, color: statusColor }}>
                        {angleError.toFixed(3)}°
                      </div>
                    </div>
                    <div>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>时间误差</span>
                      <div className="font-mono-value" style={{ fontSize: 14, fontWeight: 600, color: statusColor }}>
                        {timeError.toFixed(1)} ms
                      </div>
                    </div>
                  </div>

                  {(isStutter || isJitter) && (
                    <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                      {isStutter && (
                        <span
                          className="animate-pulse-danger"
                          style={{
                            fontSize: 11,
                            padding: '2px 8px',
                            borderRadius: 4,
                            backgroundColor: 'var(--danger-dim)',
                            color: 'var(--danger)',
                            fontWeight: 600,
                          }}
                        >
                          卡顿
                        </span>
                      )}
                      {isJitter && (
                        <span
                          className="animate-pulse-danger"
                          style={{
                            fontSize: 11,
                            padding: '2px 8px',
                            borderRadius: 4,
                            backgroundColor: 'var(--warning-dim)',
                            color: 'var(--warning)',
                            fontWeight: 600,
                          }}
                        >
                          抖动
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)', padding: 16 }}>
              <h3 className="font-display" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px 0' }}>
                角度误差趋势
              </h3>
              <TrendChart
                data={angleTrend}
                ringColors={colors}
                ringIds={rings.map((r) => r.id)}
                maxValue={syncThreshold.angleError * 2}
                label="角度误差 (°)"
              />
            </div>
            <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)', padding: 16 }}>
              <h3 className="font-display" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px 0' }}>
                时间误差趋势
              </h3>
              <TrendChart
                data={timeTrend}
                ringColors={colors}
                ringIds={rings.map((r) => r.id)}
                maxValue={syncThreshold.timeError * 2}
                label="时间误差 (ms)"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)', padding: 16, maxHeight: 300, overflow: 'auto' }}>
              <h3 className="font-display" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px 0' }}>
                <Bell size={14} style={{ verticalAlign: 'middle', marginRight: 6, color: 'var(--warning)' }} />
                告警列表
              </h3>
              {localAlerts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
                  <BellOff size={24} style={{ marginBottom: 8, opacity: 0.4 }} />
                  <p>暂无告警</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {localAlerts.map((alert, i) => {
                    const ring = rings.find((r) => r.id === alert.ringId);
                    return (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '6px 10px',
                          borderRadius: 6,
                          backgroundColor: alert.isStutter || alert.isJitter ? 'var(--danger-dim)' : 'var(--warning-dim)',
                          border: `1px solid ${alert.isStutter || alert.isJitter ? 'var(--danger)' : 'var(--warning)'}`,
                          fontSize: 12,
                        }}
                      >
                        {alert.isStutter || alert.isJitter ? (
                          <AlertTriangle size={12} style={{ color: 'var(--danger)' }} />
                        ) : (
                          <Bell size={12} style={{ color: 'var(--warning)' }} />
                        )}
                        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                          {ring?.name || alert.ringId}
                        </span>
                        <span className="font-mono-value" style={{ color: 'var(--text-secondary)' }}>
                          Δθ={alert.angleError.toFixed(3)}° Δt={alert.timeError.toFixed(1)}ms
                        </span>
                        {alert.isStutter && <span style={{ color: 'var(--danger)', fontWeight: 600 }}>卡顿</span>}
                        {alert.isJitter && <span style={{ color: 'var(--warning)', fontWeight: 600 }}>抖动</span>}
                        <button
                          onClick={() => acknowledgeAlert(i)}
                          style={{
                            marginLeft: 'auto',
                            padding: '2px 8px',
                            borderRadius: 4,
                            backgroundColor: 'var(--bg-secondary)',
                            border: '1px solid var(--border)',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            fontSize: 11,
                          }}
                        >
                          确认
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)', padding: 16 }}>
              <h3 className="font-display" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px 0' }}>
                <Settings2 size={14} style={{ verticalAlign: 'middle', marginRight: 6, color: 'var(--accent)' }} />
                阈值设置
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 0' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    角度误差阈值 (°)
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="number"
                      value={syncThreshold.angleError}
                      step={0.1}
                      min={0.01}
                      onChange={(e) => setSyncThreshold({ ...syncThreshold, angleError: parseFloat(e.target.value) || 0.5 })}
                      className="font-mono-value"
                      style={{
                        flex: 1,
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-primary)',
                        borderRadius: 6,
                        padding: '6px 10px',
                        fontSize: 14,
                        outline: 'none',
                      }}
                    />
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>°</span>
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    时间误差阈值 (ms)
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="number"
                      value={syncThreshold.timeError}
                      step={10}
                      min={1}
                      onChange={(e) => setSyncThreshold({ ...syncThreshold, timeError: parseFloat(e.target.value) || 50 })}
                      className="font-mono-value"
                      style={{
                        flex: 1,
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-primary)',
                        borderRadius: 6,
                        padding: '6px 10px',
                        fontSize: 14,
                        outline: 'none',
                      }}
                    />
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>ms</span>
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    卡顿判定阈值 (次/秒)
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="number"
                      value={syncThreshold.stutterThreshold}
                      step={1}
                      min={1}
                      onChange={(e) => setSyncThreshold({ ...syncThreshold, stutterThreshold: parseInt(e.target.value) || 3 })}
                      className="font-mono-value"
                      style={{
                        flex: 1,
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-primary)',
                        borderRadius: 6,
                        padding: '6px 10px',
                        fontSize: 14,
                        outline: 'none',
                      }}
                    />
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>次/秒</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
