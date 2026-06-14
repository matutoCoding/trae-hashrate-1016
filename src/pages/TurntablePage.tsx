import { useRef, useEffect, useCallback, useState } from 'react';
import { useStageStore } from '@/store/stageStore';
import { RING_COLORS, type TurntableRing, type LiftPlatform } from '@/types';
import { generateId } from '@/utils/physics';
import { Plus, Trash2, RotateCw, ArrowUp, AlertTriangle, CheckCircle2 } from 'lucide-react';

function createDefaultRing(index: number): TurntableRing {
  return {
    id: generateId(),
    name: `环 ${index + 1}`,
    radius: 1 + index * 0.8,
    momentOfInertia: 50 + index * 30,
    maxRPM: 12,
    initialAngle: 0,
    motor: {
      ratedTorque: 200,
      peakTorque: 400,
      maxAngularAcceleration: 2.0,
    },
    color: RING_COLORS[index % RING_COLORS.length],
  };
}

function createDefaultLift(index: number): LiftPlatform {
  return {
    id: generateId(),
    name: `升降台 ${index + 1}`,
    travelRange: 3.0,
    maxSpeed: 0.5,
    maxAcceleration: 1.0,
  };
}

interface ValidationState {
  errors: Record<string, string[]>;
  warnings: string[];
}

function validateRings(rings: TurntableRing[]): ValidationState {
  const errors: Record<string, string[]> = {};
  const warnings: string[] = [];

  rings.forEach((ring) => {
    const ringErrors: string[] = [];
    if (ring.radius <= 0) ringErrors.push('半径必须为正数');
    if (ring.momentOfInertia <= 0) ringErrors.push('转动惯量必须为正数');
    if (ring.maxRPM <= 0) ringErrors.push('最大转速必须为正数');
    if (ring.initialAngle < 0 || ring.initialAngle >= 360) ringErrors.push('初始角度应在 0~360° 之间');
    if (ring.motor.ratedTorque <= 0) ringErrors.push('额定扭矩必须为正数');
    if (ring.motor.peakTorque <= 0) ringErrors.push('峰值扭矩必须为正数');
    if (ring.motor.maxAngularAcceleration <= 0) ringErrors.push('最大角加速度必须为正数');
    if (ring.motor.ratedTorque >= ring.motor.peakTorque) ringErrors.push('额定扭矩应小于峰值扭矩');
    if (ringErrors.length > 0) errors[ring.id] = ringErrors;
  });

  for (let i = 1; i < rings.length; i++) {
    if (rings[i].radius <= rings[i - 1].radius) {
      if (!errors[rings[i].id]) errors[rings[i].id] = [];
      errors[rings[i].id].push(`半径应大于环 ${i}（${rings[i - 1].radius}m）`);
    }
    if (rings[i].radius <= rings[i - 1].radius + 0.1) {
      warnings.push(`环 ${i + 1} 与环 ${i} 半径差过小，可能存在机械干涉风险`);
    }
  }

  return { errors, warnings };
}

function RingCanvas({ rings }: { rings: TurntableRing[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const cx = w / 2;
    const cy = h / 2;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0D1117';
    ctx.fillRect(0, 0, w, h);

    const gridStep = 40;
    ctx.strokeStyle = 'rgba(45, 53, 72, 0.4)';
    ctx.lineWidth = 0.5;
    for (let x = gridStep; x < w; x += gridStep) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = gridStep; y < h; y += gridStep) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(45, 53, 72, 0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(w, cy);
    ctx.stroke();

    if (rings.length === 0) {
      ctx.fillStyle = '#6E7681';
      ctx.font = '14px Rajdhani, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('暂无环形参数', cx, cy);
      return;
    }

    const maxRadius = Math.max(...rings.map((r) => r.radius));
    const padding = 60;
    const scale = (Math.min(w, h) / 2 - padding) / (maxRadius || 1);

    const sortedRings = [...rings].sort((a, b) => b.radius - a.radius);

    sortedRings.forEach((ring) => {
      const pixelR = ring.radius * scale;
      if (pixelR <= 0) return;

      ctx.beginPath();
      ctx.arc(cx, cy, pixelR, 0, Math.PI * 2);
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, pixelR, 0, Math.PI * 2);
      ctx.fillStyle = ring.color + '12';
      ctx.fill();

      const angleRad = (ring.initialAngle * Math.PI) / 180;
      const markerX = cx + pixelR * Math.cos(angleRad);
      const markerY = cy - pixelR * Math.sin(angleRad);

      ctx.beginPath();
      ctx.arc(markerX, markerY, 5, 0, Math.PI * 2);
      ctx.fillStyle = ring.color;
      ctx.fill();
      ctx.strokeStyle = '#0D1117';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const labelAngle = -Math.PI / 4;
      const labelX = cx + pixelR * Math.cos(labelAngle);
      const labelY = cy + pixelR * Math.sin(labelAngle);

      ctx.save();
      ctx.translate(labelX, labelY);
      ctx.fillStyle = ring.color;
      ctx.font = 'bold 11px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(ring.name, 6, -4);
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.fillStyle = '#8B949E';
      ctx.fillText(`R=${ring.radius}m`, 6, 10);
      ctx.restore();
    });

    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#E6EDF3';
    ctx.fill();
  }, [rings]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        borderRadius: 8,
        border: '1px solid var(--border)',
        backgroundColor: 'var(--bg-primary)',
      }}
    />
  );
}

function NumberInput({
  label,
  value,
  unit,
  onChange,
  min,
  max,
  step = 0.1,
  error,
}: {
  label: string;
  value: number;
  unit: string;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  error?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label
        className="font-display text-xs tracking-wide uppercase"
        style={{ color: 'var(--text-secondary)' }}
      >
        {label}
      </label>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="font-mono-value text-sm flex-1 outline-none px-2 py-1.5 rounded"
          style={{
            backgroundColor: 'var(--bg-primary)',
            border: `1px solid ${error ? 'var(--danger)' : 'var(--border)'}`,
            color: 'var(--text-primary)',
          }}
        />
        <span
          className="font-mono-value text-xs whitespace-nowrap px-1.5 py-1.5 rounded"
          style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderLeft: 'none' }}
        >
          {unit}
        </span>
      </div>
    </div>
  );
}

function RingCard({
  ring,
  index,
  onUpdate,
  onRemove,
  validationErrors,
}: {
  ring: TurntableRing;
  index: number;
  onUpdate: (id: string, update: Partial<TurntableRing>) => void;
  onRemove: (id: string) => void;
  validationErrors: string[];
}) {
  const hasErrors = validationErrors.length > 0;

  return (
    <div
      className="rounded-lg p-4 flex flex-col gap-3"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: `1px solid ${ring.color}40`,
        borderLeft: `3px solid ${ring.color}`,
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: ring.color }}
          />
          <input
            type="text"
            value={ring.name}
            onChange={(e) => onUpdate(ring.id, { name: e.target.value })}
            className="font-display text-base font-semibold outline-none px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: 'transparent',
              color: 'var(--text-primary)',
              border: '1px solid transparent',
            }}
            onFocus={(e) => (e.target.style.border = '1px solid var(--border)')}
            onBlur={(e) => (e.target.style.border = '1px solid transparent')}
          />
        </div>
        <button
          onClick={() => onRemove(ring.id)}
          className="p-1 rounded transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--danger)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <NumberInput
          label="半径"
          value={ring.radius}
          unit="m"
          onChange={(v) => onUpdate(ring.id, { radius: v })}
          min={0.1}
          step={0.1}
          error={hasErrors}
        />
        <NumberInput
          label="转动惯量"
          value={ring.momentOfInertia}
          unit="kg·m²"
          onChange={(v) => onUpdate(ring.id, { momentOfInertia: v })}
          min={0.01}
          step={1}
        />
        <NumberInput
          label="最大转速"
          value={ring.maxRPM}
          unit="RPM"
          onChange={(v) => onUpdate(ring.id, { maxRPM: v })}
          min={0}
          step={0.5}
        />
        <NumberInput
          label="初始角度"
          value={ring.initialAngle}
          unit="°"
          onChange={(v) => onUpdate(ring.id, { initialAngle: v })}
          min={0}
          max={360}
          step={1}
        />
      </div>

      <div
        className="rounded-md p-3 flex flex-col gap-2"
        style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-1.5 mb-1">
          <RotateCw size={13} style={{ color: ring.color }} />
          <span
            className="font-display text-xs tracking-wide uppercase"
            style={{ color: 'var(--text-secondary)' }}
          >
            电机参数
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <NumberInput
            label="额定扭矩"
            value={ring.motor.ratedTorque}
            unit="N·m"
            onChange={(v) => onUpdate(ring.id, { motor: { ...ring.motor, ratedTorque: v } })}
            min={0}
            step={10}
          />
          <NumberInput
            label="峰值扭矩"
            value={ring.motor.peakTorque}
            unit="N·m"
            onChange={(v) => onUpdate(ring.id, { motor: { ...ring.motor, peakTorque: v } })}
            min={0}
            step={10}
          />
          <NumberInput
            label="最大角加速度"
            value={ring.motor.maxAngularAcceleration}
            unit="rad/s²"
            onChange={(v) => onUpdate(ring.id, { motor: { ...ring.motor, maxAngularAcceleration: v } })}
            min={0}
            step={0.1}
          />
        </div>
      </div>

      {validationErrors.length > 0 && (
        <div className="flex flex-col gap-1">
          {validationErrors.map((err, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--danger)' }}>
              <AlertTriangle size={12} />
              <span>{err}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LiftCard({
  lift,
  onUpdate,
  onRemove,
}: {
  lift: LiftPlatform;
  onUpdate: (id: string, update: Partial<LiftPlatform>) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div
      className="rounded-lg p-4 flex flex-col gap-3"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderLeft: '3px solid var(--warning)',
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ArrowUp size={14} style={{ color: 'var(--warning)' }} />
          <input
            type="text"
            value={lift.name}
            onChange={(e) => onUpdate(lift.id, { name: e.target.value })}
            className="font-display text-base font-semibold outline-none px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: 'transparent',
              color: 'var(--text-primary)',
              border: '1px solid transparent',
            }}
            onFocus={(e) => (e.target.style.border = '1px solid var(--border)')}
            onBlur={(e) => (e.target.style.border = '1px solid transparent')}
          />
        </div>
        <button
          onClick={() => onRemove(lift.id)}
          className="p-1 rounded transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--danger)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <NumberInput
          label="行程范围"
          value={lift.travelRange}
          unit="m"
          onChange={(v) => onUpdate(lift.id, { travelRange: v })}
          min={0}
          step={0.1}
        />
        <NumberInput
          label="最大速度"
          value={lift.maxSpeed}
          unit="m/s"
          onChange={(v) => onUpdate(lift.id, { maxSpeed: v })}
          min={0}
          step={0.01}
        />
        <NumberInput
          label="最大加速度"
          value={lift.maxAcceleration}
          unit="m/s²"
          onChange={(v) => onUpdate(lift.id, { maxAcceleration: v })}
          min={0}
          step={0.1}
        />
      </div>
    </div>
  );
}

export default function TurntablePage() {
  const rings = useStageStore((s) => s.rings);
  const lifts = useStageStore((s) => s.lifts);
  const addRing = useStageStore((s) => s.addRing);
  const updateRing = useStageStore((s) => s.updateRing);
  const removeRing = useStageStore((s) => s.removeRing);
  const addLift = useStageStore((s) => s.addLift);
  const updateLift = useStageStore((s) => s.updateLift);
  const removeLift = useStageStore((s) => s.removeLift);

  const validation = validateRings(rings);
  const hasAnyError = Object.keys(validation.errors).length > 0;
  const hasWarnings = validation.warnings.length > 0;

  const handleAddRing = useCallback(() => {
    addRing(createDefaultRing(rings.length));
  }, [addRing, rings.length]);

  const handleAddLift = useCallback(() => {
    addLift(createDefaultLift(lifts.length));
  }, [addLift, lifts.length]);

  return (
    <div className="flex gap-6 h-[calc(100vh-7rem)]">
      <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-2 min-w-0" style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent' }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl font-bold tracking-wide" style={{ color: 'var(--text-primary)' }}>
              转台参数配置
            </h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              配置环形转台、驱动电机及升降平台参数
            </p>
          </div>
          <div className="flex items-center gap-2">
            {rings.length > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-display" style={{
                backgroundColor: hasAnyError ? 'rgba(255,59,59,0.1)' : hasWarnings ? 'rgba(255,140,0,0.1)' : 'rgba(0,212,170,0.1)',
                color: hasAnyError ? 'var(--danger)' : hasWarnings ? 'var(--warning)' : 'var(--accent)',
                border: `1px solid ${hasAnyError ? 'rgba(255,59,59,0.3)' : hasWarnings ? 'rgba(255,140,0,0.3)' : 'rgba(0,212,170,0.3)'}`,
              }}>
                {hasAnyError ? <AlertTriangle size={13} /> : hasWarnings ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}
                {hasAnyError ? `${Object.keys(validation.errors).length} 项错误` : hasWarnings ? `${validation.warnings.length} 项警告` : '参数正常'}
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <RotateCw size={14} style={{ color: 'var(--accent)' }} />
              <span className="font-display text-sm tracking-wide uppercase" style={{ color: 'var(--text-secondary)' }}>
                环形转台
              </span>
              <span className="font-mono-value text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                {rings.length}
              </span>
            </div>
            <button
              onClick={handleAddRing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-display tracking-wide transition-colors"
              style={{
                backgroundColor: 'rgba(0,212,170,0.1)',
                color: 'var(--accent)',
                border: '1px solid rgba(0,212,170,0.3)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,212,170,0.2)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,212,170,0.1)'; }}
            >
              <Plus size={14} />
              添加环
            </button>
          </div>

          <div className="flex flex-col gap-3">
            {rings.map((ring, index) => (
              <RingCard
                key={ring.id}
                ring={ring}
                index={index}
                onUpdate={updateRing}
                onRemove={removeRing}
                validationErrors={validation.errors[ring.id] || []}
              />
            ))}
            {rings.length === 0 && (
              <div
                className="flex flex-col items-center justify-center py-8 rounded-lg"
                style={{ backgroundColor: 'var(--bg-card)', border: '1px dashed var(--border)' }}
              >
                <RotateCw size={28} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
                <span className="text-sm font-display" style={{ color: 'var(--text-muted)' }}>
                  暂无环形转台，点击上方按钮添加
                </span>
              </div>
            )}
          </div>
        </div>

        {validation.warnings.length > 0 && (
          <div
            className="rounded-lg p-3 flex flex-col gap-1.5"
            style={{ backgroundColor: 'rgba(255,140,0,0.06)', border: '1px solid rgba(255,140,0,0.2)' }}
          >
            {validation.warnings.map((w, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--warning)' }}>
                <AlertTriangle size={12} />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <ArrowUp size={14} style={{ color: 'var(--warning)' }} />
              <span className="font-display text-sm tracking-wide uppercase" style={{ color: 'var(--text-secondary)' }}>
                升降平台
              </span>
              <span className="font-mono-value text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                {lifts.length}
              </span>
            </div>
            <button
              onClick={handleAddLift}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-display tracking-wide transition-colors"
              style={{
                backgroundColor: 'rgba(255,140,0,0.1)',
                color: 'var(--warning)',
                border: '1px solid rgba(255,140,0,0.3)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,140,0,0.2)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,140,0,0.1)'; }}
            >
              <Plus size={14} />
              添加升降台
            </button>
          </div>

          <div className="flex flex-col gap-3">
            {lifts.map((lift) => (
              <LiftCard
                key={lift.id}
                lift={lift}
                onUpdate={updateLift}
                onRemove={removeLift}
              />
            ))}
            {lifts.length === 0 && (
              <div
                className="flex flex-col items-center justify-center py-8 rounded-lg"
                style={{ backgroundColor: 'var(--bg-card)', border: '1px dashed var(--border)' }}
              >
                <ArrowUp size={28} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
                <span className="text-sm font-display" style={{ color: 'var(--text-muted)' }}>
                  暂无升降平台，点击上方按钮添加
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className="flex flex-col gap-2 rounded-lg p-3"
        style={{
          width: 400,
          minWidth: 400,
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border)',
        }}
      >
        <div className="flex items-center justify-between">
          <span className="font-display text-sm tracking-wide uppercase" style={{ color: 'var(--text-secondary)' }}>
            同心环预览
          </span>
          <span className="font-mono-value text-xs" style={{ color: 'var(--text-muted)' }}>
            {rings.length} 环
          </span>
        </div>
        <div className="flex-1 min-h-0">
          <RingCanvas rings={rings} />
        </div>
        <div className="flex flex-col gap-1">
          {rings.map((ring) => (
            <div key={ring.id} className="flex items-center gap-2 text-xs">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ring.color }} />
              <span className="font-display" style={{ color: 'var(--text-secondary)' }}>{ring.name}</span>
              <span className="font-mono-value" style={{ color: 'var(--text-muted)' }}>R={ring.radius}m</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
