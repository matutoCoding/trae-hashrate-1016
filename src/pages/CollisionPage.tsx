import { useState, useRef, useEffect, useCallback } from 'react';
import { useStageStore } from '@/store/stageStore';
import { RING_COLORS, type VerificationItem, type CollisionResult, type CollisionZone } from '@/types';
import { linearVelocity, relativeLinearVelocity, detectCollisions, verifyTorque, verifySafety, computeCompositeTrajectory, angularPositionAt, rpmToRadPerSec } from '@/utils/physics';
import { G_ACCEL, SAFETY_TANGENTIAL_ACCEL } from '@/types';
import { ShieldAlert, AlertTriangle, CheckCircle2, Play, RotateCcw } from 'lucide-react';

const LINEAR_VELOCITY_LIMIT = 2.0;

function severityIcon(severity: VerificationItem['severity']) {
  switch (severity) {
    case 'ok':
      return <CheckCircle2 size={16} style={{ color: 'var(--accent)' }} />;
    case 'warning':
      return <AlertTriangle size={16} style={{ color: 'var(--warning)' }} />;
    case 'danger':
      return <ShieldAlert size={16} style={{ color: 'var(--danger)' }} />;
  }
}

function severityBadge(severity: VerificationItem['severity']) {
  const map = {
    ok: { bg: 'var(--accent-dim)', color: 'var(--accent)', text: '✓' },
    warning: { bg: 'var(--warning-dim)', color: 'var(--warning)', text: '⚠' },
    danger: { bg: 'var(--danger-dim)', color: 'var(--danger)', text: '✗' },
  };
  const s = map[severity];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        borderRadius: 6,
        backgroundColor: s.bg,
        color: s.color,
        fontWeight: 700,
        fontSize: 14,
      }}
    >
      {s.text}
    </span>
  );
}

function formatNum(n: number, decimals = 2) {
  return n.toFixed(decimals);
}

function TableHeader({ columns }: { columns: string[] }) {
  return (
    <tr
      style={{
        borderBottom: '1px solid var(--border)',
      }}
    >
      {columns.map((col, i) => (
        <th
          key={i}
          className="font-display"
          style={{
            padding: '10px 14px',
            textAlign: 'left',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-secondary)',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}
        >
          {col}
        </th>
      ))}
    </tr>
  );
}

function CardSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        backgroundColor: 'var(--bg-card)',
        borderRadius: 12,
        border: '1px solid var(--border)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '14px 20px',
          borderBottom: '1px solid var(--border)',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        {icon}
        <h2
          className="font-display"
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--text-primary)',
            margin: 0,
            letterSpacing: '0.03em',
          }}
        >
          {title}
        </h2>
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}

function TurntableCanvas({
  rings,
  collisionResults,
  animTime,
  animPlaying,
  segmentsMap,
}: {
  rings: ReturnType<typeof useStageStore>['rings'];
  collisionResults: CollisionResult[];
  animTime: number;
  animPlaying: boolean;
  segmentsMap: Record<string, import('@/types').MotionSegment[]>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);
  const timeRef = useRef<number>(animTime);

  useEffect(() => {
    timeRef.current = animTime;
  }, [animTime]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const size = Math.min(canvas.parentElement?.clientWidth ?? 480, 560);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const maxRadius = rings.length > 0 ? Math.max(...rings.map(r => r.radius)) : 5;
    const scale = (size * 0.38) / maxRadius;

    ctx.clearRect(0, 0, size, size);

    ctx.fillStyle = 'var(--bg-primary)';
    ctx.fillRect(0, 0, size, size);

    const gridColor = 'rgba(45, 53, 72, 0.5)';
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;
    for (let r = 1; r <= 5; r++) {
      ctx.beginPath();
      ctx.arc(cx, cy, (maxRadius / 5) * r * scale, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.42, cy);
    ctx.lineTo(cx + size * 0.42, cy);
    ctx.moveTo(cx, cy - size * 0.42);
    ctx.lineTo(cx, cy + size * 0.42);
    ctx.stroke();

    const allZones: { startAngle: number; endAngle: number; severity: CollisionZone['severity'] }[] = [];
    for (const cr of collisionResults) {
      for (const z of cr.collisionZones) {
        allZones.push(z);
      }
    }

    const flashOn = Math.floor(Date.now() / 400) % 2 === 0;

    for (let i = rings.length - 1; i >= 0; i--) {
      const ring = rings[i];
      const outerR = ring.radius * scale;
      const innerR = i > 0 ? rings[i - 1].radius * scale : 0;

      const segs = segmentsMap[ring.id] || [];
      let angleOffset = ring.initialAngle;
      for (const seg of segs) {
        if (timeRef.current >= seg.startTime && timeRef.current <= seg.endTime) {
          angleOffset = angularPositionAt(timeRef.current, seg, ring.initialAngle);
          break;
        }
      }
      const angleRad = (angleOffset * Math.PI) / 180;

      const ringColor = RING_COLORS[i % RING_COLORS.length];

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angleRad);

      ctx.beginPath();
      ctx.arc(0, 0, outerR, 0, Math.PI * 2);
      if (innerR > 0) {
        ctx.arc(0, 0, innerR, 0, Math.PI * 2, true);
      }
      ctx.closePath();
      ctx.fillStyle = `${ringColor}22`;
      ctx.fill();
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(innerR + 4, 0);
      ctx.lineTo(outerR - 4, 0);
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = 3;
      ctx.stroke();

      const markerAngle = Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo((innerR + 4) * Math.cos(markerAngle), (innerR + 4) * Math.sin(markerAngle));
      ctx.lineTo((outerR - 4) * Math.cos(markerAngle), (outerR - 4) * Math.sin(markerAngle));
      ctx.strokeStyle = `${ringColor}88`;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.restore();
    }

    for (const zone of allZones) {
      const startRad = (zone.startAngle * Math.PI) / 180;
      const endRad = (zone.endAngle * Math.PI) / 180;

      const isCritical = zone.severity === 'critical';
      const flashVisible = flashOn || !isCritical;

      if (flashVisible) {
        for (let ri = 0; ri < rings.length - 1; ri++) {
          const boundaryR = rings[ri].radius * scale;
          const bandWidth = 12;

          ctx.save();
          ctx.translate(cx, cy);
          ctx.beginPath();
          ctx.arc(0, 0, boundaryR + bandWidth / 2, startRad, endRad);
          ctx.arc(0, 0, boundaryR - bandWidth / 2, endRad, startRad, true);
          ctx.closePath();
          ctx.fillStyle = isCritical ? 'rgba(255, 59, 59, 0.6)' : 'rgba(255, 140, 0, 0.4)';
          ctx.fill();
          ctx.restore();
        }
      }
    }

    const safeFlashOn = Math.floor(Date.now() / 600) % 2 === 0;
    if (safeFlashOn && allZones.length === 0 && rings.length > 1) {
      for (let ri = 0; ri < rings.length - 1; ri++) {
        const boundaryR = rings[ri].radius * scale;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.beginPath();
        ctx.arc(0, 0, boundaryR, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 212, 170, 0.4)';
        ctx.lineWidth = 6;
        ctx.setLineDash([8, 8]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    const legendY = size - 30;
    ctx.font = '12px "Source Sans 3", sans-serif';
    ctx.fillStyle = 'rgba(255, 59, 59, 0.8)';
    ctx.fillRect(16, legendY, 12, 12);
    ctx.fillStyle = 'var(--text-secondary)';
    ctx.fillText('碰撞区域', 34, legendY + 11);

    ctx.fillStyle = 'rgba(0, 212, 170, 0.6)';
    ctx.fillRect(110, legendY, 12, 12);
    ctx.fillStyle = 'var(--text-secondary)';
    ctx.fillText('安全区域', 128, legendY + 11);

    ctx.fillStyle = 'rgba(255, 140, 0, 0.6)';
    ctx.fillRect(204, legendY, 12, 12);
    ctx.fillStyle = 'var(--text-secondary)';
    ctx.fillText('警告区域', 222, legendY + 11);
  }, [rings, collisionResults, segmentsMap]);

  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      if (animPlaying) {
        timeRef.current += 0.016;
      }
      draw();
      frameRef.current = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      running = false;
      cancelAnimationFrame(frameRef.current);
    };
  }, [draw, animPlaying]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <canvas
        ref={canvasRef}
        style={{
          borderRadius: 8,
          border: '1px solid var(--border)',
          backgroundColor: '#0D1117',
        }}
      />
    </div>
  );
}

function TrajectoryCanvas({
  points,
  ringName,
}: {
  points: { x: number; y: number; z: number; t: number }[];
  ringName: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || points.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const size = Math.min(canvas.parentElement?.clientWidth ?? 480, 560);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;

    ctx.fillStyle = '#0D1117';
    ctx.fillRect(0, 0, size, size);

    const gridColor = 'rgba(45, 53, 72, 0.5)';
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;
    for (let i = -5; i <= 5; i++) {
      const px = cx + (i / 5) * size * 0.4;
      ctx.beginPath();
      ctx.moveTo(px, 20);
      ctx.lineTo(px, size - 20);
      ctx.stroke();
      const py = cy + (i / 5) * size * 0.4;
      ctx.beginPath();
      ctx.moveTo(20, py);
      ctx.lineTo(size - 20, py);
      ctx.stroke();
    }

    const maxCoord = Math.max(
      ...points.map(p => Math.max(Math.abs(p.x), Math.abs(p.y))),
      0.01
    );
    const drawScale = (size * 0.38) / maxCoord;

    const zMin = Math.min(...points.map(p => p.z));
    const zMax = Math.max(...points.map(p => p.z));
    const zRange = zMax - zMin || 1;

    function zToColor(z: number): string {
      const norm = (z - zMin) / zRange;
      const r = Math.round(norm * 255);
      const b = Math.round((1 - norm) * 255);
      const g = Math.round((1 - Math.abs(norm - 0.5) * 2) * 180);
      return `rgb(${r}, ${g}, ${b})`;
    }

    for (let i = 1; i < points.length; i++) {
      const p0 = points[i - 1];
      const p1 = points[i];
      ctx.beginPath();
      ctx.moveTo(cx + p0.x * drawScale, cy - p0.y * drawScale);
      ctx.lineTo(cx + p1.x * drawScale, cy - p1.y * drawScale);
      ctx.strokeStyle = zToColor(p1.z);
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    if (points.length > 0) {
      const first = points[0];
      ctx.beginPath();
      ctx.arc(cx + first.x * drawScale, cy - first.y * drawScale, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#00D4AA';
      ctx.fill();

      const last = points[points.length - 1];
      ctx.beginPath();
      ctx.arc(cx + last.x * drawScale, cy - last.y * drawScale, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#FF3B3B';
      ctx.fill();
    }

    const legendX = size - 140;
    const legendY = 20;
    ctx.fillStyle = 'rgba(26, 31, 46, 0.9)';
    ctx.fillRect(legendX, legendY, 120, 80);
    ctx.strokeStyle = 'var(--border)';
    ctx.lineWidth = 1;
    ctx.strokeRect(legendX, legendY, 120, 80);

    ctx.font = '11px "Source Sans 3", sans-serif';
    ctx.fillStyle = 'var(--text-secondary)';
    ctx.fillText('Z轴高度', legendX + 8, legendY + 16);

    const barX = legendX + 12;
    const barY = legendY + 26;
    const barH = 36;
    const gradient = ctx.createLinearGradient(barX, barY, barX, barY + barH);
    gradient.addColorStop(0, 'rgb(0, 100, 255)');
    gradient.addColorStop(0.5, 'rgb(128, 180, 128)');
    gradient.addColorStop(1, 'rgb(255, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(barX, barY, 14, barH);

    ctx.fillStyle = 'var(--text-muted)';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText(`${formatNum(zMin, 1)}m`, barX + 20, barY + 8);
    ctx.fillText(`${formatNum(zMax, 1)}m`, barX + 20, barY + barH - 2);
  }, [points, ringName]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <canvas
        ref={canvasRef}
        style={{
          borderRadius: 8,
          border: '1px solid var(--border)',
          backgroundColor: '#0D1117',
        }}
      />
    </div>
  );
}

export default function CollisionPage() {
  const { rings, lifts, scripts, currentScriptId, getCurrentScript } = useStageStore();
  const [animTime, setAnimTime] = useState(0);
  const [animPlaying, setAnimPlaying] = useState(false);
  const [animSpeed, setAnimSpeed] = useState(1);

  const currentScript = getCurrentScript();

  const segmentsMap: Record<string, import('@/types').MotionSegment[]> = {};
  const liftSegmentsMap: Record<string, import('@/types').LiftSegment[]> = {};

  if (currentScript) {
    for (const scene of currentScript.scenes) {
      for (const seg of scene.motionSegments) {
        if (!segmentsMap[seg.ringId]) segmentsMap[seg.ringId] = [];
        segmentsMap[seg.ringId].push(seg);
      }
      for (const ls of scene.liftSegments) {
        if (!liftSegmentsMap[ls.liftId]) liftSegmentsMap[ls.liftId] = [];
        liftSegmentsMap[ls.liftId].push(ls);
      }
    }
  }

  const sortedRings = [...rings].sort((a, b) => a.radius - b.radius);

  const linearVelocityData = sortedRings.map((ring, idx) => {
    const segs = segmentsMap[ring.id] || [];
    const maxRPM = segs.length > 0 ? Math.max(...segs.map(s => s.targetRPM)) : ring.maxRPM;
    const v = linearVelocity(maxRPM, ring.radius);
    const overSpeed = v > LINEAR_VELOCITY_LIMIT;
    return { ring, idx, maxRPM, v, overSpeed };
  });

  const relativeVelocityData: {
    ringA: string;
    ringB: string;
    nameA: string;
    nameB: string;
    vRel: number;
  }[] = [];
  for (let i = 0; i < sortedRings.length - 1; i++) {
    const a = sortedRings[i];
    const b = sortedRings[i + 1];
    const segsA = segmentsMap[a.id] || [];
    const segsB = segmentsMap[b.id] || [];
    const rpmA = segsA.length > 0 ? Math.max(...segsA.map(s => s.targetRPM)) : a.maxRPM;
    const rpmB = segsB.length > 0 ? Math.max(...segsB.map(s => s.targetRPM)) : b.maxRPM;
    const dirA = segsA.length > 0 ? segsA[0].direction : 1;
    const dirB = segsB.length > 0 ? segsB[0].direction : 1;
    const vA = linearVelocity(rpmA * dirA, a.radius);
    const vB = linearVelocity(rpmB * dirB, b.radius);
    relativeVelocityData.push({
      ringA: a.id,
      ringB: b.id,
      nameA: a.name,
      nameB: b.name,
      vRel: Math.abs(vA - vB),
    });
  }

  const collisionResults: CollisionResult[] = [];
  for (let i = 0; i < sortedRings.length - 1; i++) {
    for (let j = i + 1; j < sortedRings.length; j++) {
      const result = detectCollisions(
        sortedRings[i],
        sortedRings[j],
        segmentsMap[sortedRings[i].id] || [],
        segmentsMap[sortedRings[j].id] || [],
      );
      if (result.hasCollision) {
        collisionResults.push(result);
      }
    }
  }

  const torqueVerifications: VerificationItem[] = [];
  for (const ring of sortedRings) {
    const segs = segmentsMap[ring.id] || [];
    for (const seg of segs) {
      torqueVerifications.push(verifyTorque(seg, ring));
    }
  }

  const safetyVerifications: VerificationItem[] = [];
  for (const ring of sortedRings) {
    const segs = segmentsMap[ring.id] || [];
    for (const seg of segs) {
      safetyVerifications.push(verifySafety(seg, ring));
    }
  }

  const allVerifications = [...torqueVerifications, ...safetyVerifications];

  const compositeTrajectoryData: {
    ringName: string;
    points: { x: number; y: number; z: number; t: number }[];
  }[] = [];

  if (lifts.length > 0 && currentScript) {
    for (const ring of sortedRings) {
      const segs = segmentsMap[ring.id] || [];
      if (segs.length === 0) continue;

      for (const scene of currentScript.scenes) {
        const hasOverlap = scene.motionSegments.some(s => s.ringId === ring.id) && scene.liftSegments.length > 0;
        if (!hasOverlap) continue;

        const liftSeg = scene.liftSegments[0];
        const motionSeg = scene.motionSegments.find(s => s.ringId === ring.id);
        if (!motionSeg) continue;

        const duration = scene.endTime - scene.startTime;
        const points = computeCompositeTrajectory(
          motionSeg,
          ring,
          liftSeg.startTime,
          liftSeg.endTime,
          liftSeg.speed,
          0,
          duration,
          0.2,
        );
        compositeTrajectoryData.push({ ringName: ring.name, points });
      }
    }
  }

  const hasAnyCollision = collisionResults.length > 0;
  const hasAnyDanger = allVerifications.some(v => v.severity === 'danger');
  const hasAnyWarning = allVerifications.some(v => v.severity === 'warning');

  useEffect(() => {
    if (!animPlaying) return;
    let raf: number;
    let lastTs = performance.now();
    const step = (ts: number) => {
      const dt = (ts - lastTs) / 1000;
      lastTs = ts;
      setAnimTime(prev => {
        const next = prev + dt * animSpeed;
        return next > 120 ? 0 : next;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [animPlaying, animSpeed]);

  const overallStatus = hasAnyDanger ? 'danger' : hasAnyCollision ? 'danger' : hasAnyWarning ? 'warning' : 'ok';
  const statusColors = {
    ok: { bg: 'var(--accent-dim)', border: 'var(--accent)', color: 'var(--accent)', label: '系统安全' },
    warning: { bg: 'var(--warning-dim)', border: 'var(--warning)', color: 'var(--warning)', label: '存在警告' },
    danger: { bg: 'var(--danger-dim)', border: 'var(--danger)', color: 'var(--danger)', label: '存在危险' },
  };
  const st = statusColors[overallStatus];

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--bg-primary)',
        padding: '24px 32px',
        color: 'var(--text-primary)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 24,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <ShieldAlert size={28} style={{ color: 'var(--danger)' }} />
          <div>
            <h1
              className="font-display"
              style={{
                fontSize: 28,
                fontWeight: 700,
                margin: 0,
                letterSpacing: '0.02em',
                color: 'var(--text-primary)',
              }}
            >
              碰撞校验
            </h1>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                color: 'var(--text-muted)',
                marginTop: 2,
              }}
            >
              舞台转台工业控制系统 · 碰撞检测与安全校验
            </p>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 8,
              backgroundColor: st.bg,
              border: `1px solid ${st.border}`,
              color: st.color,
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            {overallStatus === 'danger' && <ShieldAlert size={16} />}
            {overallStatus === 'warning' && <AlertTriangle size={16} />}
            {overallStatus === 'ok' && <CheckCircle2 size={16} />}
            {st.label}
          </div>

          <button
            onClick={() => setAnimPlaying(!animPlaying)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 8,
              backgroundColor: animPlaying ? 'var(--accent-dim)' : 'var(--bg-secondary)',
              border: `1px solid ${animPlaying ? 'var(--accent)' : 'var(--border)'}`,
              color: animPlaying ? 'var(--accent)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            <Play size={14} />
            {animPlaying ? '暂停' : '播放'}
          </button>

          <button
            onClick={() => {
              setAnimTime(0);
              setAnimPlaying(false);
            }}
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
            <RotateCcw size={14} />
            重置
          </button>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: 6,
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>速度</span>
            {[0.5, 1, 2].map(s => (
              <button
                key={s}
                onClick={() => setAnimSpeed(s)}
                style={{
                  padding: '2px 8px',
                  borderRadius: 4,
                  border: 'none',
                  backgroundColor: animSpeed === s ? 'var(--accent)' : 'transparent',
                  color: animSpeed === s ? '#0D1117' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {s}x
              </button>
            ))}
          </div>

          <span
            className="font-mono-value"
            style={{
              fontSize: 13,
              color: 'var(--text-muted)',
              minWidth: 80,
            }}
          >
            t = {formatNum(animTime, 1)}s
          </span>
        </div>
      </div>

      {rings.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: '60px 20px',
            color: 'var(--text-muted)',
            fontSize: 15,
          }}
        >
          <ShieldAlert size={48} style={{ marginBottom: 12, opacity: 0.4 }} />
          <p>暂无环数据，请先在脚本中配置转台环信息</p>
        </div>
      )}

      {rings.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 20,
            }}
          >
            <CardSection title="线速度计算" icon={<AlertTriangle size={18} style={{ color: 'var(--warning)' }} />}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <TableHeader columns={['环', 'RPM', '半径(m)', '线速度(m/s)', '状态']} />
                  </thead>
                  <tbody>
                    {linearVelocityData.map(({ ring, idx, maxRPM, v, overSpeed }) => (
                      <tr
                        key={ring.id}
                        style={{ borderBottom: '1px solid var(--border)' }}
                      >
                        <td style={{ padding: '8px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: 2,
                                backgroundColor: RING_COLORS[idx % RING_COLORS.length],
                                display: 'inline-block',
                              }}
                            />
                            <span style={{ fontWeight: 500 }}>{ring.name}</span>
                          </div>
                        </td>
                        <td className="font-mono-value" style={{ padding: '8px 14px', color: 'var(--text-secondary)' }}>
                          {formatNum(maxRPM, 1)}
                        </td>
                        <td className="font-mono-value" style={{ padding: '8px 14px', color: 'var(--text-secondary)' }}>
                          {formatNum(ring.radius, 3)}
                        </td>
                        <td className="font-mono-value" style={{ padding: '8px 14px', color: overSpeed ? 'var(--danger)' : 'var(--accent)' }}>
                          {formatNum(v, 3)}
                        </td>
                        <td style={{ padding: '8px 14px' }}>
                          {overSpeed ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '2px 8px',
                                borderRadius: 4,
                                backgroundColor: 'var(--danger-dim)',
                                color: 'var(--danger)',
                                fontSize: 12,
                                fontWeight: 600,
                              }}
                            >
                              <ShieldAlert size={12} /> 超速
                            </span>
                          ) : (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '2px 8px',
                                borderRadius: 4,
                                backgroundColor: 'var(--accent-dim)',
                                color: 'var(--accent)',
                                fontSize: 12,
                                fontWeight: 600,
                              }}
                            >
                              <CheckCircle2 size={12} /> 正常
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div
                style={{
                  marginTop: 8,
                  padding: '8px 12px',
                  borderRadius: 6,
                  backgroundColor: 'var(--bg-secondary)',
                  fontSize: 12,
                  color: 'var(--text-muted)',
                }}
              >
                v = ω × r，线速度限制 {LINEAR_VELOCITY_LIMIT} m/s
              </div>
            </CardSection>

            <CardSection title="环边界相对速度" icon={<AlertTriangle size={18} style={{ color: 'var(--warning)' }} />}>
              {relativeVelocityData.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0', fontSize: 14 }}>
                  需要至少两个环
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <TableHeader columns={['内环', '外环', '相对速度(m/s)', '状态']} />
                    </thead>
                    <tbody>
                      {relativeVelocityData.map((rv, i) => {
                        const isHigh = rv.vRel > LINEAR_VELOCITY_LIMIT;
                        return (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '8px 14px', fontWeight: 500 }}>{rv.nameA}</td>
                            <td style={{ padding: '8px 14px', fontWeight: 500 }}>{rv.nameB}</td>
                            <td
                              className="font-mono-value"
                              style={{
                                padding: '8px 14px',
                                color: isHigh ? 'var(--danger)' : 'var(--text-secondary)',
                              }}
                            >
                              {formatNum(rv.vRel, 3)}
                            </td>
                            <td style={{ padding: '8px 14px' }}>
                              {isHigh ? (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    padding: '2px 8px',
                                    borderRadius: 4,
                                    backgroundColor: 'var(--danger-dim)',
                                    color: 'var(--danger)',
                                    fontSize: 12,
                                    fontWeight: 600,
                                  }}
                                >
                                  ⚠ 高速差
                                </span>
                              ) : (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    padding: '2px 8px',
                                    borderRadius: 4,
                                    backgroundColor: 'var(--accent-dim)',
                                    color: 'var(--accent)',
                                    fontSize: 12,
                                    fontWeight: 600,
                                  }}
                                >
                                  ✓ 安全
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <div
                style={{
                  marginTop: 8,
                  padding: '8px 12px',
                  borderRadius: 6,
                  backgroundColor: 'var(--bg-secondary)',
                  fontSize: 12,
                  color: 'var(--text-muted)',
                }}
              >
                Δv = |v₁ - v₂|，相邻环边界相对线速度
              </div>
            </CardSection>
          </div>

          <CardSection
            title="碰撞检测 - 转台俯视图"
            icon={<ShieldAlert size={18} style={{ color: hasAnyCollision ? 'var(--danger)' : 'var(--accent)' }} />}
          >
            <TurntableCanvas
              rings={sortedRings}
              collisionResults={collisionResults}
              animTime={animTime}
              animPlaying={animPlaying}
              segmentsMap={segmentsMap}
            />
            {hasAnyCollision && (
              <div style={{ marginTop: 12 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginBottom: 8,
                    color: 'var(--danger)',
                    fontWeight: 600,
                    fontSize: 14,
                  }}
                >
                  <ShieldAlert size={16} />
                  检测到碰撞区域
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <TableHeader columns={['环A', '环B', '碰撞起始角(°)', '碰撞终止角(°)', '起始时间(s)', '终止时间(s)', '严重程度']} />
                    </thead>
                    <tbody>
                      {collisionResults.flatMap(cr =>
                        cr.collisionZones.map((zone, zi) => (
                          <tr key={`${cr.ringIdA}-${cr.ringIdB}-${zi}`} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '6px 14px', fontWeight: 500 }}>
                              {sortedRings.find(r => r.id === cr.ringIdA)?.name ?? cr.ringIdA}
                            </td>
                            <td style={{ padding: '6px 14px', fontWeight: 500 }}>
                              {sortedRings.find(r => r.id === cr.ringIdB)?.name ?? cr.ringIdB}
                            </td>
                            <td className="font-mono-value" style={{ padding: '6px 14px', color: 'var(--text-secondary)' }}>
                              {formatNum(zone.startAngle, 1)}
                            </td>
                            <td className="font-mono-value" style={{ padding: '6px 14px', color: 'var(--text-secondary)' }}>
                              {formatNum(zone.endAngle, 1)}
                            </td>
                            <td className="font-mono-value" style={{ padding: '6px 14px', color: 'var(--text-secondary)' }}>
                              {formatNum(zone.startTime, 1)}
                            </td>
                            <td className="font-mono-value" style={{ padding: '6px 14px', color: 'var(--text-secondary)' }}>
                              {formatNum(zone.endTime, 1)}
                            </td>
                            <td style={{ padding: '6px 14px' }}>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                  backgroundColor: zone.severity === 'critical' ? 'var(--danger-dim)' : 'var(--warning-dim)',
                                  color: zone.severity === 'critical' ? 'var(--danger)' : 'var(--warning)',
                                  fontSize: 12,
                                  fontWeight: 600,
                                }}
                              >
                                {zone.severity === 'critical' ? '✗ 严重' : '⚠ 警告'}
                              </span>
                            </td>
                          </tr>
                        )),
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {!hasAnyCollision && sortedRings.length > 1 && (
              <div
                style={{
                  marginTop: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  color: 'var(--accent)',
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                <CheckCircle2 size={16} />
                未检测到碰撞，所有区域安全
              </div>
            )}
          </CardSection>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 20,
            }}
          >
            <CardSection title="扭矩校验" icon={<AlertTriangle size={18} style={{ color: 'var(--warning)' }} />}>
              {allVerifications.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0', fontSize: 14 }}>
                  暂无运动段数据
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <TableHeader columns={['状态', '校验项', '计算值', '限制值']} />
                    </thead>
                    <tbody>
                      {torqueVerifications.map((v, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px 14px' }}>{severityBadge(v.severity)}</td>
                          <td style={{ padding: '8px 14px', fontWeight: 500, fontSize: 14 }}>{v.label}</td>
                          <td
                            className="font-mono-value"
                            style={{
                              padding: '8px 14px',
                              color: v.severity === 'danger' ? 'var(--danger)' : v.severity === 'warning' ? 'var(--warning)' : 'var(--text-secondary)',
                              fontSize: 13,
                            }}
                          >
                            {v.value}
                          </td>
                          <td style={{ padding: '8px 14px', color: 'var(--text-muted)', fontSize: 13 }}>{v.limit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div
                style={{
                  marginTop: 8,
                  padding: '8px 12px',
                  borderRadius: 6,
                  backgroundColor: 'var(--bg-secondary)',
                  fontSize: 12,
                  color: 'var(--text-muted)',
                }}
              >
                T = I × α，校验加速度扭矩是否在电机额定/峰值扭矩范围内
              </div>
            </CardSection>

            <CardSection title="安全校验" icon={<ShieldAlert size={18} style={{ color: 'var(--danger)' }} />}>
              {safetyVerifications.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0', fontSize: 14 }}>
                  暂无运动段数据
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <TableHeader columns={['状态', '校验项', '切向加速度', '限制值']} />
                    </thead>
                    <tbody>
                      {safetyVerifications.map((v, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px 14px' }}>{severityBadge(v.severity)}</td>
                          <td style={{ padding: '8px 14px', fontWeight: 500, fontSize: 14 }}>{v.label}</td>
                          <td
                            className="font-mono-value"
                            style={{
                              padding: '8px 14px',
                              color: v.severity === 'danger' ? 'var(--danger)' : 'var(--text-secondary)',
                              fontSize: 13,
                            }}
                          >
                            {v.value}
                          </td>
                          <td style={{ padding: '8px 14px', color: 'var(--text-muted)', fontSize: 13 }}>{v.limit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div
                style={{
                  marginTop: 8,
                  padding: '8px 12px',
                  borderRadius: 6,
                  backgroundColor: 'var(--bg-secondary)',
                  fontSize: 12,
                  color: 'var(--text-muted)',
                }}
              >
                a_t = α × r，切向加速度限制 ≤ {formatNum(SAFETY_TANGENTIAL_ACCEL, 1)} m/s² (0.5g)
              </div>
            </CardSection>
          </div>

          <CardSection
            title="复合轨迹仿真"
            icon={<Play size={18} style={{ color: 'var(--accent)' }} />}
          >
            {compositeTrajectoryData.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0', fontSize: 14 }}>
                需要升降台与转台运动时间重叠的数据，暂无可仿真的复合轨迹
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {compositeTrajectoryData.map((data, i) => (
                  <div key={i}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 8,
                      }}
                    >
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 2,
                          backgroundColor: RING_COLORS[i % RING_COLORS.length],
                          display: 'inline-block',
                        }}
                      />
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{data.ringName}</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                        (X-Y投影，Z轴高度映射为颜色)
                      </span>
                    </div>
                    <TrajectoryCanvas points={data.points} ringName={data.ringName} />
                  </div>
                ))}
              </div>
            )}
            <div
              style={{
                marginTop: 8,
                padding: '8px 12px',
                borderRadius: 6,
                backgroundColor: 'var(--bg-secondary)',
                fontSize: 12,
                color: 'var(--text-muted)',
              }}
            >
              升降台+转台运动叠加时的复合轨迹，X-Y平面投影，Z轴高度映射为颜色(蓝→低，红→高)
            </div>
          </CardSection>
        </div>
      )}
    </div>
  );
}
