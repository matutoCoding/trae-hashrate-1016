import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useStageStore } from '@/store/stageStore';
import { RING_COLORS, type VerificationItem, type CollisionResult, type CollisionZone, type TurntableRing, type SafetyReport, type SafetyReportItem, type RiskItem, type MotionScript } from '@/types';
import { linearVelocity, relativeLinearVelocity, detectCollisions, verifyTorque, verifySafety, computeCompositeTrajectory, angularPositionAt, rpmToRadPerSec, totalAngleAt, generateId } from '@/utils/physics';
import { G_ACCEL, SAFETY_TANGENTIAL_ACCEL } from '@/types';
import { ShieldAlert, AlertTriangle, CheckCircle2, Play, RotateCcw, Download, FileText, History, Save, AlertOctagon, Lightbulb, Gauge, Calendar } from 'lucide-react';

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
  segmentsMap,
}: {
  rings: TurntableRing[],
  collisionResults: CollisionResult[],
  animTime: number,
  segmentsMap: Record<string, import('@/types').MotionSegment[]>,
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);

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

    ctx.fillStyle = '#0D1117';
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
    const activeZones: { startAngle: number; endAngle: number; severity: CollisionZone['severity'] }[] = [];
    for (const cr of collisionResults) {
      for (const z of cr.collisionZones) {
        allZones.push(z);
        if (animTime >= z.startTime - 0.5 && animTime <= z.endTime + 0.5) {
          activeZones.push(z);
        }
      }
    }

    const flashOn = Math.floor(Date.now() / 400) % 2 === 0;

    for (let i = rings.length - 1; i >= 0; i--) {
      const ring = rings[i];
      const outerR = ring.radius * scale;
      const innerR = i > 0 ? rings[i - 1].radius * scale : 0;

      const segs = segmentsMap[ring.id] || [];
      const angleOffset = totalAngleAt(animTime, segs, ring.initialAngle);
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

    for (const zone of activeZones) {
      const isCritical = zone.severity === 'critical';
      const flashVisible = flashOn || !isCritical;

      if (flashVisible) {
        for (let ri = 0; ri < rings.length - 1; ri++) {
          const boundaryR = rings[ri].radius * scale;
          const bandWidth = 12;

          const startRad = (zone.startAngle * Math.PI) / 180;
          const endRad = (zone.endAngle * Math.PI) / 180;

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
    if (safeFlashOn && activeZones.length === 0 && rings.length > 1) {
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
    ctx.fillStyle = '#8B949E';
    ctx.fillText('碰撞区域', 34, legendY + 11);

    ctx.fillStyle = 'rgba(0, 212, 170, 0.6)';
    ctx.fillRect(110, legendY, 12, 12);
    ctx.fillStyle = '#8B949E';
    ctx.fillText('安全区域', 128, legendY + 11);

    ctx.fillStyle = 'rgba(255, 140, 0, 0.6)';
    ctx.fillRect(204, legendY, 12, 12);
    ctx.fillStyle = '#8B949E';
    ctx.fillText('警告区域', 222, legendY + 11);
  }, [rings, collisionResults, segmentsMap, animTime]);

  useEffect(() => {
    draw();
    frameRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frameRef.current);
    };
  }, [draw]);

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

function generateSafetyReport(
  script: import('@/types').MotionScript | null,
  sortedRings: TurntableRing[],
  segmentsMap: Record<string, import('@/types').MotionSegment[]>,
  collisionResults: CollisionResult[],
  syncEvents: import('@/types').SyncEvent[] = [],
): SafetyReport | null {
  if (!script || script.scenes.length === 0) return null;

  const ringNameMap: Record<string, string> = {};
  const ringIdMap: Record<string, string> = {};
  sortedRings.forEach(r => { ringNameMap[r.id] = r.name; ringIdMap[r.name] = r.id; });

  const sceneReports: SafetyReportItem[] = [];
  const allRiskItems: RiskItem[] = [];
  let totalOverSpeed = 0;
  let totalTorqueWarnings = 0;
  let totalSafetyWarnings = 0;
  let totalCollisions = 0;
  let criticalCollisions = 0;
  let overallStatus: SafetyReport['overallStatus'] = 'ok';
  let overallRiskScore = 0;

  for (const scene of script.scenes) {
    const sceneMotionSegs: Record<string, import('@/types').MotionSegment[]> = {};
    for (const seg of scene.motionSegments) {
      if (!sceneMotionSegs[seg.ringId]) sceneMotionSegs[seg.ringId] = [];
      sceneMotionSegs[seg.ringId].push(seg);
    }

    const overSpeedItems: SafetyReportItem['overSpeedItems'] = [];
    for (const ring of sortedRings) {
      const segs = sceneMotionSegs[ring.id] || [];
      if (segs.length === 0) continue;
      let maxRPM = 0;
      let peakSeg = segs[0];
      for (const seg of segs) {
        if (seg.targetRPM > maxRPM) { maxRPM = seg.targetRPM; peakSeg = seg; }
      }
      const v = linearVelocity(maxRPM, ring.radius);
      if (v > LINEAR_VELOCITY_LIMIT) {
        const peakTime = peakSeg.startTime + (peakSeg.endTime - peakSeg.startTime) / 2;
        overSpeedItems.push({ ringName: ring.name, maxRPM, maxVelocity: v, limit: LINEAR_VELOCITY_LIMIT, peakTime });
        totalOverSpeed++;
        overallStatus = 'danger';

        const riskId = `risk_${generateId()}`;
        const overPct = ((v - LINEAR_VELOCITY_LIMIT) / LINEAR_VELOCITY_LIMIT) * 100;
        const score = 20 + Math.min(overPct, 80);
        allRiskItems.push({
          id: riskId,
          sceneId: scene.id,
          sceneName: scene.name,
          time: peakTime,
          type: 'overspeed',
          severity: overPct > 50 ? 'critical' : 'warning',
          ringIds: [ring.id],
          ringNames: [ring.name],
          description: `${ring.name} 边缘线速度 ${v.toFixed(2)} m/s，超过安全限制 ${LINEAR_VELOCITY_LIMIT} m/s (${overPct.toFixed(0)}%)`,
          score,
          suggestion: `降低 ${ring.name} 转速至 ${Math.floor((LINEAR_VELOCITY_LIMIT / ring.radius) * 60 / (2 * Math.PI))} RPM 以下，或缩小环半径`,
        });
        overallRiskScore += score;
      }
    }

    const torqueItems: SafetyReportItem['torqueItems'] = [];
    for (const ring of sortedRings) {
      const segs = sceneMotionSegs[ring.id] || [];
      for (const seg of segs) {
        const v = verifyTorque(seg, ring);
        if (v.severity !== 'ok') {
          const peakTime = seg.startTime + (seg.endTime - seg.startTime) / 2;
          torqueItems.push({ ringName: ring.name, value: v.value, limit: v.limit, severity: v.severity, peakTime });
          if (v.severity === 'danger') totalTorqueWarnings += 2; else totalTorqueWarnings++;
          if (v.severity === 'danger') overallStatus = 'danger';
          else if (overallStatus === 'ok') overallStatus = 'warning';

          const riskId = `risk_${generateId()}`;
          const score = v.severity === 'danger' ? 50 : 25;
          allRiskItems.push({
            id: riskId,
            sceneId: scene.id,
            sceneName: scene.name,
            time: peakTime,
            type: 'torque',
            severity: v.severity as 'warning' | 'critical',
            ringIds: [ring.id],
            ringNames: [ring.name],
            description: `${ring.name} 扭矩需求 ${v.value}，超过电机额定 ${v.limit}`,
            score,
            suggestion: `延长 ${ring.name} 的加减速时间（当前 ${seg.accelerationTime}s 加速，${seg.decelerationTime}s 减速），或降低目标转速`,
          });
          overallRiskScore += score;
        }
      }
    }

    const safetyItems: SafetyReportItem['safetyItems'] = [];
    for (const ring of sortedRings) {
      const segs = sceneMotionSegs[ring.id] || [];
      for (const seg of segs) {
        const v = verifySafety(seg, ring);
        if (v.severity !== 'ok') {
          const peakTime = seg.startTime + (seg.endTime - seg.startTime) / 2;
          safetyItems.push({ ringName: ring.name, value: v.value, limit: v.limit, severity: v.severity, peakTime });
          if (v.severity === 'danger') totalSafetyWarnings += 2; else totalSafetyWarnings++;
          if (v.severity === 'danger') overallStatus = 'danger';
          else if (overallStatus === 'ok') overallStatus = 'warning';

          const riskId = `risk_${generateId()}`;
          const score = v.severity === 'danger' ? 60 : 30;
          allRiskItems.push({
            id: riskId,
            sceneId: scene.id,
            sceneName: scene.name,
            time: peakTime,
            type: 'safety',
            severity: v.severity as 'warning' | 'critical',
            ringIds: [ring.id],
            ringNames: [ring.name],
            description: `${ring.name} 切向加速度 ${v.value}，超过演员站立安全阈值 ${v.limit}`,
            score,
            suggestion: `降低 ${ring.name} 的加减速斜率，延长运动时间以减小加速度，确保演员不会因惯性摔倒`,
          });
          overallRiskScore += score;
        }
      }
    }

    const collisionItems: SafetyReportItem['collisionItems'] = [];
    for (const cr of collisionResults) {
      for (const z of cr.collisionZones) {
        if (z.startTime >= scene.startTime && z.startTime <= scene.endTime) {
          collisionItems.push({
            ringA: ringNameMap[cr.ringIdA] ?? cr.ringIdA,
            ringB: ringNameMap[cr.ringIdB] ?? cr.ringIdB,
            startTime: z.startTime,
            endTime: z.endTime,
            severity: z.severity,
          });
          totalCollisions++;
          if (z.severity === 'critical') criticalCollisions++;
          if (z.severity === 'critical') overallStatus = 'danger';
          else if (overallStatus === 'ok') overallStatus = 'warning';

          const riskId = `risk_${generateId()}`;
          const duration = z.endTime - z.startTime;
          const score = z.severity === 'critical' ? (40 + Math.min(duration * 10, 60)) : (20 + Math.min(duration * 5, 30));
          allRiskItems.push({
            id: riskId,
            sceneId: scene.id,
            sceneName: scene.name,
            time: z.startTime,
            type: 'collision',
            severity: z.severity,
            ringIds: [cr.ringIdA, cr.ringIdB],
            ringNames: [ringNameMap[cr.ringIdA] ?? cr.ringIdA, ringNameMap[cr.ringIdB] ?? cr.ringIdB],
            description: `${ringNameMap[cr.ringIdA] ?? cr.ringIdA} 与 ${ringNameMap[cr.ringIdB] ?? cr.ringIdB} 在 ${z.startTime.toFixed(1)}s - ${z.endTime.toFixed(1)}s 发生${z.severity === 'critical' ? '严重' : ''}碰撞，持续 ${duration.toFixed(1)}s`,
            score,
            suggestion: `调整 ${ringNameMap[cr.ringIdA] ?? cr.ringIdA} 和 ${ringNameMap[cr.ringIdB] ?? cr.ringIdB} 的转速方向或启停时序，避免反向旋转重叠；或错开碰撞时间段，将其中一环的运动延后 ${(duration + 0.5).toFixed(1)}s`,
          });
          overallRiskScore += score;
        }
      }
    }

    let sceneRiskScore = 0;
    sceneRiskScore += overSpeedItems.length * 25;
    sceneRiskScore += torqueItems.filter(t => t.severity === 'danger').length * 50;
    sceneRiskScore += torqueItems.filter(t => t.severity === 'warning').length * 25;
    sceneRiskScore += safetyItems.filter(s => s.severity === 'danger').length * 60;
    sceneRiskScore += safetyItems.filter(s => s.severity === 'warning').length * 30;
    sceneRiskScore += collisionItems.filter(c => c.severity === 'critical').length * 80;
    sceneRiskScore += collisionItems.filter(c => c.severity === 'warning').length * 40;

    let riskLevel: SafetyReportItem['riskLevel'] = 'low';
    if (sceneRiskScore >= 150) riskLevel = 'critical';
    else if (sceneRiskScore >= 80) riskLevel = 'high';
    else if (sceneRiskScore >= 30) riskLevel = 'medium';

    sceneReports.push({
      sceneId: scene.id,
      sceneName: scene.name,
      startTime: scene.startTime,
      endTime: scene.endTime,
      overSpeedItems,
      torqueItems,
      safetyItems,
      collisionItems,
      riskScore: sceneRiskScore,
      riskLevel,
    });
  }

  allRiskItems.sort((a, b) => b.score - a.score);

  const recommendations: string[] = [];
  if (criticalCollisions > 0) {
    recommendations.push(`【最高优先级】存在 ${criticalCollisions} 处严重碰撞，必须立即调整相关环的运动方向或时序，避免演出事故`);
  }
  if (totalOverSpeed > 0) {
    recommendations.push(`存在 ${totalOverSpeed} 处边缘线速度超速，建议降低高速环的转速，防止道具被甩出`);
  }
  const torqueDanger = sceneReports.reduce((sum, s) => sum + s.torqueItems.filter(t => t.severity === 'danger').length, 0);
  if (torqueDanger > 0) {
    recommendations.push(`存在 ${torqueDanger} 处扭矩严重告警，可能导致电机过载跳闸，需延长加减速时间`);
  }
  const safetyDanger = sceneReports.reduce((sum, s) => sum + s.safetyItems.filter(si => si.severity === 'danger').length, 0);
  if (safetyDanger > 0) {
    recommendations.push(`存在 ${safetyDanger} 处演员安全加速度告警，过大的加速度可能导致演员摔倒，需放缓运动节奏`);
  }
  if (allRiskItems.length > 0) {
    const topRisk = allRiskItems[0];
    recommendations.push(`最高风险点：${topRisk.sceneName} ${topRisk.time.toFixed(1)}s - ${topRisk.description}`);
  }
  if (recommendations.length === 0) {
    recommendations.push('✓ 脚本安全检查通过，所有参数均在安全范围内，可以放心演出');
  }

  const scriptDuration = Math.max(...script.scenes.map(s => s.endTime), 0);
  const acknowledgedEventIds = syncEvents.filter(e => e.scriptId === script.id && e.acknowledged).map(e => e.id);

  return {
    id: `report_${generateId()}`,
    scriptId: script.id,
    scriptName: script.name,
    operator: script.operator,
    generatedAt: Date.now(),
    performanceDate: new Date().toISOString().split('T')[0],
    totalDuration: scriptDuration,
    overallStatus,
    overallRiskScore,
    scenes: sceneReports,
    summary: {
      totalOverSpeed,
      totalTorqueWarnings,
      totalSafetyWarnings,
      totalCollisions,
      criticalCollisions,
    },
    riskRanking: allRiskItems,
    recommendations,
    scriptSnapshot: JSON.parse(JSON.stringify(script)),
    acknowledgedEvents: acknowledgedEventIds,
  };
}

function reportToText(report: SafetyReport): string {
  const lines: string[] = [];
  lines.push('╔══════════════════════════════════════════════════════════════╗');
  lines.push('║            舞台转台演出安全报告                              ║');
  lines.push('╚══════════════════════════════════════════════════════════════╝');
  lines.push('');
  lines.push(`报告编号: ${report.id}`);
  lines.push(`生成时间: ${new Date(report.generatedAt).toLocaleString('zh-CN')}`);
  lines.push(`演出日期: ${report.performanceDate || new Date().toISOString().split('T')[0]}`);
  lines.push(`脚本名称: ${report.scriptName}`);
  lines.push(`操作员: ${report.operator || '(未填写)'}`);
  lines.push(`总时长: ${formatNum(report.totalDuration, 1)}s`);
  lines.push(`整体状态: ${report.overallStatus === 'ok' ? '✓ 安全' : report.overallStatus === 'warning' ? '⚠ 警告' : '✗ 危险'}`);
  lines.push(`综合风险评分: ${report.overallRiskScore.toFixed(0)} 分`);
  lines.push(`已确认告警: ${(report.acknowledgedEvents?.length || 0)} 条`);
  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('【汇总统计】');
  lines.push(`  • 超速项: ${report.summary.totalOverSpeed} 项`);
  lines.push(`  • 扭矩告警: ${report.summary.totalTorqueWarnings} 项`);
  lines.push(`  • 安全加速度告警: ${report.summary.totalSafetyWarnings} 项`);
  lines.push(`  • 碰撞片段: ${report.summary.totalCollisions} 段 (严重: ${report.summary.criticalCollisions} 段)`);
  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('【风险排序 TOP 10】（按危险程度从高到低）');
  const topRisks = report.riskRanking.slice(0, 10);
  topRisks.forEach((r, i) => {
    const sev = r.severity === 'critical' ? '严重' : '警告';
    const typeName = { collision: '碰撞', overspeed: '超速', torque: '扭矩', safety: '安全' }[r.type];
    lines.push(`  ${i + 1}. [${sev}] ${r.sceneName} t=${r.time.toFixed(1)}s (${r.score.toFixed(0)}分)`);
    lines.push(`     ${typeName}: ${r.description}`);
    lines.push(`     建议: ${r.suggestion}`);
    lines.push('');
  });
  if (report.riskRanking.length === 0) {
    lines.push('  ✓ 无风险项');
    lines.push('');
  }
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('【整改建议】');
  report.recommendations.forEach((rec, i) => {
    lines.push(`  ${i + 1}. ${rec}`);
  });
  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════');

  for (const scene of report.scenes) {
    const sceneStatus =
      scene.collisionItems.some(c => c.severity === 'critical')
        || scene.torqueItems.some(t => t.severity === 'danger')
        || scene.safetyItems.some(s => s.severity === 'danger')
        || scene.overSpeedItems.length > 0 ? '✗ 危险'
      : scene.collisionItems.some(c => c.severity === 'warning')
        || scene.torqueItems.some(t => t.severity === 'warning')
        || scene.safetyItems.some(s => s.severity === 'warning') ? '⚠ 警告'
      : '✓ 安全';

    lines.push(`【${scene.sceneName}】 ${formatNum(scene.startTime, 1)}s - ${formatNum(scene.endTime, 1)}s    [${sceneStatus}]`);
    if (scene.overSpeedItems.length > 0) {
      lines.push(`  → 超速 (${scene.overSpeedItems.length} 项):`);
      for (const item of scene.overSpeedItems) {
        lines.push(`    • ${item.ringName}: ${formatNum(item.maxVelocity, 3)} m/s (限制 ${item.limit} m/s), ${item.maxRPM} RPM`);
      }
    }
    if (scene.torqueItems.length > 0) {
      lines.push(`  → 扭矩告警 (${scene.torqueItems.length} 项):`);
      for (const item of scene.torqueItems) {
        lines.push(`    ${item.severity === 'danger' ? '✗' : '⚠'} ${item.ringName}: ${item.value} (限制 ${item.limit})`);
      }
    }
    if (scene.safetyItems.length > 0) {
      lines.push(`  → 安全加速度告警 (${scene.safetyItems.length} 项):`);
      for (const item of scene.safetyItems) {
        lines.push(`    ${item.severity === 'danger' ? '✗' : '⚠'} ${item.ringName}: ${item.value} (限制 ${item.limit})`);
      }
    }
    if (scene.collisionItems.length > 0) {
      lines.push(`  → 碰撞片段 (${scene.collisionItems.length} 段):`);
      for (const item of scene.collisionItems) {
        lines.push(`    ${item.severity === 'critical' ? '✗' : '⚠'} ${item.ringA} ↔ ${item.ringB}: ${formatNum(item.startTime, 1)}s - ${formatNum(item.endTime, 1)}s`);
      }
    }
    lines.push('');
  }

  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('报告由 StageRig 舞台转台联动控制系统自动生成');
  lines.push(`生成时间戳: ${report.generatedAt}`);

  return lines.join('\n');
}

export default function CollisionPage() {
  const { rings, lifts, scripts, currentScriptId, getCurrentScript } = useStageStore();
  const [animTime, setAnimTime] = useState(0);
  const [animPlaying, setAnimPlaying] = useState(false);
  const [animSpeed, setAnimSpeed] = useState(1);
  const [showReport, setShowReport] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'history'>('overview');

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

  const scriptDuration = currentScript
    ? Math.max(...currentScript.scenes.map((s) => s.endTime), 10)
    : 60;

  const collisionResults: CollisionResult[] = [];
  for (let i = 0; i < sortedRings.length - 1; i++) {
    for (let j = i + 1; j < sortedRings.length; j++) {
      const result = detectCollisions(
        sortedRings[i],
        sortedRings[j],
        segmentsMap[sortedRings[i].id] || [],
        segmentsMap[sortedRings[j].id] || [],
        30,
        0.1,
        scriptDuration,
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
        const points = computeCompositeTrajectory(
          segs,
          ring,
          liftSeg.startTime,
          liftSeg.endTime,
          liftSeg.speed,
          0,
          0,
          scriptDuration,
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
        return next > scriptDuration ? 0 : next;
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
          <button
            onClick={() => {
              const rpt = generateSafetyReport(currentScript, sortedRings, segmentsMap, collisionResults);
              if (rpt) {
                const blob = new Blob([reportToText(rpt)], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${rpt.scriptName.replace(/\s+/g, '_')}_安全报告_${new Date().toISOString().slice(0, 10)}.txt`;
                a.click();
                URL.revokeObjectURL(url);
              }
            }}
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
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
              opacity: !currentScript ? 0.4 : 1,
            }}
          >
            <Download size={14} />
            导出报告
          </button>

          <button
            onClick={() => setShowReport(!showReport)}
            disabled={!currentScript}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 8,
              backgroundColor: showReport ? 'var(--accent-dim)' : 'var(--bg-secondary)',
              border: `1px solid ${showReport ? 'var(--accent)' : 'var(--border)'}`,
              color: showReport ? 'var(--accent)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
              opacity: !currentScript ? 0.4 : 1,
            }}
          >
            <FileText size={14} />
            {showReport ? '关闭报告' : '安全报告'}
          </button>

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
          <input
            type="range"
            min={0}
            max={scriptDuration}
            step={0.1}
            value={animTime}
            onChange={(e) => {
              setAnimPlaying(false);
              setAnimTime(parseFloat(e.target.value));
            }}
            style={{
              width: 180,
              accentColor: 'var(--accent)',
            }}
          />
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
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, borderBottom: '1px solid var(--border)' }}>
              <button
                onClick={() => setActiveTab('overview')}
                style={{
                  padding: '8px 14px',
                  border: 'none',
                  background: 'transparent',
                  color: activeTab === 'overview' ? 'var(--accent)' : 'var(--text-muted)',
                  fontSize: 13,
                  fontWeight: 600,
                  borderBottom: activeTab === 'overview' ? '2px solid var(--accent)' : '2px solid transparent',
                  cursor: 'pointer',
                }}
              >
                实时碰撞
              </button>
              <button
                onClick={() => setActiveTab('history')}
                style={{
                  padding: '8px 14px',
                  border: 'none',
                  background: 'transparent',
                  color: activeTab === 'history' ? 'var(--accent)' : 'var(--text-muted)',
                  fontSize: 13,
                  fontWeight: 600,
                  borderBottom: activeTab === 'history' ? '2px solid var(--accent)' : '2px solid transparent',
                  cursor: 'pointer',
                }}
              >
                <History size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                历史碰撞 ({collisionResults.reduce((sum, cr) => sum + cr.collisionZones.length, 0)})
              </button>
            </div>

            {activeTab === 'overview' && (
              <>
                <TurntableCanvas
                  rings={sortedRings}
                  collisionResults={collisionResults}
                  animTime={animTime}
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
                      当前时间附近的碰撞区域
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <TableHeader columns={['环A', '环B', '碰撞起始角(°)', '碰撞终止角(°)', '起始时间(s)', '终止时间(s)', '严重程度', '操作']} />
                        </thead>
                        <tbody>
                          {collisionResults.flatMap(cr =>
                            cr.collisionZones
                              .filter(z => animTime >= z.startTime - 0.5 && animTime <= z.endTime + 0.5)
                              .map((zone, zi) => (
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
                                  <td style={{ padding: '6px 14px' }}>
                                    <button
                                      onClick={() => {
                                        setAnimPlaying(false);
                                        setAnimTime(zone.startTime);
                                      }}
                                      style={{
                                        background: 'var(--accent-dim)',
                                        border: 'none',
                                        color: 'var(--accent)',
                                        padding: '2px 8px',
                                        borderRadius: 4,
                                        fontSize: 11,
                                        cursor: 'pointer',
                                        fontWeight: 600,
                                      }}
                                    >
                                      跳转到
                                    </button>
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
              </>
            )}

            {activeTab === 'history' && (
              <div style={{ maxHeight: 500, overflowY: 'auto' }}>
                {collisionResults.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40, fontSize: 14 }}>
                    暂无碰撞记录
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {collisionResults.flatMap(cr =>
                      cr.collisionZones.map((zone, zi) => (
                        <div
                          key={`${cr.ringIdA}-${cr.ringIdB}-${zi}`}
                          onClick={() => {
                            setAnimPlaying(false);
                            setAnimTime(zone.startTime);
                            setActiveTab('overview');
                          }}
                          style={{
                            padding: 12,
                            borderRadius: 6,
                            background: zone.severity === 'critical' ? 'var(--danger-dim)' : 'var(--warning-dim)',
                            border: `1px solid ${zone.severity === 'critical' ? 'var(--danger)' : 'var(--warning)'}`,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                          }}
                        >
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: 32,
                              height: 32,
                              borderRadius: '50%',
                              background: zone.severity === 'critical' ? 'var(--danger)' : 'var(--warning)',
                              color: '#fff',
                              fontWeight: 700,
                              flexShrink: 0,
                            }}
                          >
                            {zone.severity === 'critical' ? '✗' : '⚠'}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13, marginBottom: 2 }}>
                              {sortedRings.find(r => r.id === cr.ringIdA)?.name ?? cr.ringIdA}
                              {' ↔ '}
                              {sortedRings.find(r => r.id === cr.ringIdB)?.name ?? cr.ringIdB}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                              角度: {formatNum(zone.startAngle, 1)}° → {formatNum(zone.endAngle, 1)}°
                              {' | '}
                              时间: {formatNum(zone.startTime, 1)}s → {formatNum(zone.endTime, 1)}s
                              {' | '}
                              时长: {formatNum(zone.endTime - zone.startTime, 1)}s
                            </div>
                          </div>
                          <span style={{ color: 'var(--accent)', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                            点击跳转 →
                          </span>
                        </div>
                      )),
                    )}
                  </div>
                )}
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

          {showReport && currentScript && (
            <CardSection
              title="演出安全报告"
              icon={<FileText size={18} style={{ color: 'var(--accent)' }} />}
            >
              {(() => {
                const rpt = generateSafetyReport(currentScript, sortedRings, segmentsMap, collisionResults);
                if (!rpt) return <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>无可用报告</div>;
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, background: 'var(--bg-secondary)', borderRadius: 6 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{rpt.scriptName}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                          操作员: {rpt.operator || '(未填写)'} | 生成时间: {new Date(rpt.generatedAt).toLocaleString('zh-CN')} | 总时长: {formatNum(rpt.totalDuration, 1)}s
                        </div>
                      </div>
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '8px 16px',
                          borderRadius: 8,
                          backgroundColor: rpt.overallStatus === 'ok' ? 'var(--accent-dim)' : rpt.overallStatus === 'warning' ? 'var(--warning-dim)' : 'var(--danger-dim)',
                          border: `1px solid ${rpt.overallStatus === 'ok' ? 'var(--accent)' : rpt.overallStatus === 'warning' ? 'var(--warning)' : 'var(--danger)'}`,
                          color: rpt.overallStatus === 'ok' ? 'var(--accent)' : rpt.overallStatus === 'warning' ? 'var(--warning)' : 'var(--danger)',
                          fontWeight: 700,
                          fontSize: 14,
                        }}
                      >
                        {rpt.overallStatus === 'ok' ? '✓ 整体安全' : rpt.overallStatus === 'warning' ? '⚠ 存在警告' : '✗ 存在危险'}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
                      <div style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 6, textAlign: 'center' }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color: rpt.summary.totalOverSpeed > 0 ? 'var(--danger)' : 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{rpt.summary.totalOverSpeed}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>超速项</div>
                      </div>
                      <div style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 6, textAlign: 'center' }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color: rpt.summary.totalTorqueWarnings > 0 ? 'var(--warning)' : 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{rpt.summary.totalTorqueWarnings}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>扭矩告警</div>
                      </div>
                      <div style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 6, textAlign: 'center' }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color: rpt.summary.totalSafetyWarnings > 0 ? 'var(--warning)' : 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{rpt.summary.totalSafetyWarnings}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>安全加速度告警</div>
                      </div>
                      <div style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 6, textAlign: 'center' }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color: rpt.summary.totalCollisions > 0 ? 'var(--danger)' : 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{rpt.summary.totalCollisions}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>碰撞片段</div>
                      </div>
                      <div style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 6, textAlign: 'center' }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color: rpt.summary.criticalCollisions > 0 ? 'var(--danger)' : 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{rpt.summary.criticalCollisions}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>严重碰撞</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {rpt.scenes.map(scene => {
                        const hasIssue = scene.overSpeedItems.length + scene.torqueItems.length + scene.safetyItems.length + scene.collisionItems.length > 0;
                        return (
                          <div key={scene.sceneId} style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                            <div style={{ padding: '10px 14px', background: 'var(--bg-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{scene.sceneName}</span>
                                <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 8, fontFamily: 'var(--font-mono)' }}>
                                  {formatNum(scene.startTime, 1)}s – {formatNum(scene.endTime, 1)}s
                                </span>
                              </div>
                              {!hasIssue && (
                                <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>✓ 该场景无问题</span>
                              )}
                            </div>
                            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                              {scene.overSpeedItems.length > 0 && (
                                <div>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--danger)', marginBottom: 4 }}>⚠ 超速 ({scene.overSpeedItems.length} 项)</div>
                                  {scene.overSpeedItems.map((item, i) => (
                                    <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', padding: '3px 8px', background: 'var(--danger-dim)', borderRadius: 3, marginBottom: 2 }}>
                                      {item.ringName}: {formatNum(item.maxVelocity, 3)} m/s (限制 {item.limit} m/s) @ {item.maxRPM} RPM
                                    </div>
                                  ))}
                                </div>
                              )}
                              {scene.torqueItems.length > 0 && (
                                <div>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--warning)', marginBottom: 4 }}>⚠ 扭矩告警 ({scene.torqueItems.length} 项)</div>
                                  {scene.torqueItems.map((item, i) => (
                                    <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', padding: '3px 8px', background: 'var(--warning-dim)', borderRadius: 3, marginBottom: 2 }}>
                                      {item.severity === 'danger' ? '✗' : '⚠'} {item.ringName}: {item.value} (限制 {item.limit})
                                    </div>
                                  ))}
                                </div>
                              )}
                              {scene.safetyItems.length > 0 && (
                                <div>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--warning)', marginBottom: 4 }}>⚠ 安全加速度告警 ({scene.safetyItems.length} 项)</div>
                                  {scene.safetyItems.map((item, i) => (
                                    <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', padding: '3px 8px', background: 'var(--warning-dim)', borderRadius: 3, marginBottom: 2 }}>
                                      {item.severity === 'danger' ? '✗' : '⚠'} {item.ringName}: {item.value} (限制 {item.limit})
                                    </div>
                                  ))}
                                </div>
                              )}
                              {scene.collisionItems.length > 0 && (
                                <div>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--danger)', marginBottom: 4 }}>⚠ 碰撞片段 ({scene.collisionItems.length} 段)</div>
                                  {scene.collisionItems.map((item, i) => (
                                    <div
                                      key={i}
                                      onClick={() => {
                                        setAnimPlaying(false);
                                        setAnimTime(item.startTime);
                                        setShowReport(false);
                                      }}
                                      style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', padding: '3px 8px', background: item.severity === 'critical' ? 'var(--danger-dim)' : 'var(--warning-dim)', borderRadius: 3, marginBottom: 2, cursor: 'pointer' }}
                                    >
                                      {item.severity === 'critical' ? '✗' : '⚠'} {item.ringA} ↔ {item.ringB}: {formatNum(item.startTime, 1)}s – {formatNum(item.endTime, 1)}s
                                      <span style={{ float: 'right', color: 'var(--accent)', fontSize: 10 }}>点击跳转 →</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </CardSection>
          )}
        </div>
      )}
    </div>
  );
}
