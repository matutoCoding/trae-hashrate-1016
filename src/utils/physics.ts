import type { TurntableRing, MotionSegment, CollisionZone, CollisionResult, VerificationItem } from '@/types';
import { G_ACCEL, SAFETY_TANGENTIAL_ACCEL } from '@/types';

export function rpmToRadPerSec(rpm: number): number {
  return (2 * Math.PI * rpm) / 60;
}

export function radPerSecToRPM(radPerSec: number): number {
  return (radPerSec * 60) / (2 * Math.PI);
}

export function linearVelocity(rpm: number, radiusM: number): number {
  return rpmToRadPerSec(rpm) * radiusM;
}

export function relativeLinearVelocity(rpmA: number, radiusA: number, rpmB: number, radiusB: number): number {
  return Math.abs(linearVelocity(rpmA, radiusA) - linearVelocity(rpmB, radiusB));
}

export function trapezoidalAccel(
  t: number,
  startTime: number,
  accelTime: number,
  steadyTime: number,
  decelTime: number,
  targetRPM: number
): number {
  const elapsed = t - startTime;
  const targetRad = rpmToRadPerSec(targetRPM);
  if (elapsed < 0 || elapsed > accelTime + steadyTime + decelTime) return 0;
  if (elapsed < accelTime) {
    return targetRad / accelTime;
  }
  if (elapsed < accelTime + steadyTime) {
    return 0;
  }
  return -targetRad / decelTime;
}

export function scurveAccel(
  t: number,
  startTime: number,
  accelTime: number,
  steadyTime: number,
  decelTime: number,
  targetRPM: number
): number {
  const elapsed = t - startTime;
  const targetRad = rpmToRadPerSec(targetRPM);
  if (elapsed < 0 || elapsed > accelTime + steadyTime + decelTime) return 0;
  if (elapsed < accelTime) {
    const p = elapsed / accelTime;
    return targetRad / accelTime * (6 * p * (1 - p));
  }
  if (elapsed < accelTime + steadyTime) {
    return 0;
  }
  const p = (elapsed - accelTime - steadyTime) / decelTime;
  return -targetRad / decelTime * (6 * p * (1 - p));
}

export function angularVelocityAt(
  t: number,
  segment: MotionSegment
): number {
  const direction = segment.direction;
  const targetRad = rpmToRadPerSec(segment.targetRPM) * direction;
  const accelDur = segment.accelerationTime;
  const totalDur = segment.endTime - segment.startTime;
  const decelDur = segment.decelerationTime;
  const steadyDur = totalDur - accelDur - decelDur;
  const elapsed = t - segment.startTime;

  if (elapsed < 0 || elapsed > totalDur) return 0;

  if (segment.curveType === 'trapezoidal') {
    if (elapsed < accelDur) {
      return targetRad * (elapsed / accelDur);
    }
    if (elapsed < accelDur + steadyDur) {
      return targetRad;
    }
    return targetRad * (1 - (elapsed - accelDur - steadyDur) / decelDur);
  }

  const p = elapsed < accelDur
    ? elapsed / accelDur
    : elapsed < accelDur + steadyDur
    ? 1
    : 1 - (elapsed - accelDur - steadyDur) / decelDur;

  if (elapsed < accelDur) {
    const pp = elapsed / accelDur;
    return targetRad * (3 * pp * pp - 2 * pp * pp * pp);
  }
  if (elapsed < accelDur + steadyDur) {
    return targetRad;
  }
  const pd = (elapsed - accelDur - steadyDur) / decelDur;
  return targetRad * (1 - 3 * pd * pd + 2 * pd * pd * pd);
}

export function totalAngleAt(
  globalTime: number,
  segments: MotionSegment[],
  initialAngle: number
): number {
  let angle = initialAngle;
  const sorted = [...segments].sort((a, b) => a.startTime - b.startTime);
  for (const seg of sorted) {
    if (globalTime >= seg.endTime) {
      angle = angularPositionAt(seg.endTime, seg, angle);
    } else if (globalTime >= seg.startTime && globalTime <= seg.endTime) {
      angle = angularPositionAt(globalTime, seg, angle);
      break;
    }
  }
  return angle;
}

export function angularPositionAt(
  t: number,
  segment: MotionSegment,
  initialAngle: number
): number {
  const direction = segment.direction;
  const targetOmega = rpmToRadPerSec(segment.targetRPM) * direction;
  const accelDur = segment.accelerationTime;
  const totalDur = segment.endTime - segment.startTime;
  const decelDur = segment.decelerationTime;
  const steadyDur = totalDur - accelDur - decelDur;
  const elapsed = t - segment.startTime;

  if (elapsed <= 0) return initialAngle;

  let dispRad = 0;

  if (segment.curveType === 'trapezoidal') {
    if (elapsed >= totalDur) {
      dispRad = 0.5 * targetOmega * accelDur + targetOmega * steadyDur + 0.5 * targetOmega * decelDur;
    } else if (elapsed < accelDur) {
      dispRad = 0.5 * targetOmega * elapsed * elapsed / accelDur;
    } else if (elapsed < accelDur + steadyDur) {
      const accelDisp = 0.5 * targetOmega * accelDur;
      dispRad = accelDisp + targetOmega * (elapsed - accelDur);
    } else {
      const accelDisp = 0.5 * targetOmega * accelDur;
      const steadyDisp = targetOmega * steadyDur;
      const decelElapsed = elapsed - accelDur - steadyDur;
      dispRad = accelDisp + steadyDisp + targetOmega * decelElapsed * (1 - 0.5 * decelElapsed / decelDur);
    }
  } else {
    if (elapsed >= totalDur) {
      const accelDisp = targetOmega * accelDur * (1 - 1 / (accelDur > 0 ? 2 : 1));
      dispRad = 0;
      const pp = 1;
      dispRad += targetOmega * accelDur * (pp * pp * pp - 0.5 * pp * pp * pp * pp);
      dispRad += targetOmega * steadyDur;
      const pd = 1;
      dispRad += targetOmega * decelDur * (pd - 1.5 * pd * pd + 0.5 * pd * pd * pd);
    } else if (elapsed < accelDur) {
      const p = elapsed / (accelDur || 1);
      dispRad = targetOmega * accelDur * (p * p * p - 0.5 * p * p * p * p);
    } else if (elapsed < accelDur + steadyDur) {
      const p = 1;
      const accelDisp = targetOmega * accelDur * (p * p * p - 0.5 * p * p * p * p);
      dispRad = accelDisp + targetOmega * (elapsed - accelDur);
    } else {
      const p = 1;
      const accelDisp = targetOmega * accelDur * (p * p * p - 0.5 * p * p * p * p);
      const steadyDisp = targetOmega * steadyDur;
      const pd = (elapsed - accelDur - steadyDur) / (decelDur || 1);
      const decelDisp = targetOmega * decelDur * (pd - 1.5 * pd * pd + 0.5 * pd * pd * pd);
      dispRad = accelDisp + steadyDisp + decelDisp;
    }
  }

  return initialAngle + (dispRad * 180) / Math.PI;
}

export function detectCollisions(
  ringA: TurntableRing,
  ringB: TurntableRing,
  segmentsA: MotionSegment[],
  segmentsB: MotionSegment[],
  propWidthDeg: number = 30,
  timeStep: number = 0.1,
  duration: number = 60
): CollisionResult {
  const zones: CollisionZone[] = [];
  let hasCollision = false;

  const directionA = segmentsA.some(s => s.direction === 1) ? 1 : segmentsA.some(s => s.direction === -1) ? -1 : 0;
  const directionB = segmentsB.some(s => s.direction === 1) ? 1 : segmentsB.some(s => s.direction === -1) ? -1 : 0;

  if (directionA * directionB >= 0) {
    return { hasCollision: false, ringIdA: ringA.id, ringIdB: ringB.id, collisionZones: [] };
  }

  let inZone = false;
  let zoneStart = 0;
  let zoneStartAngle = 0;

  for (let t = 0; t <= duration; t += timeStep) {
    const posA = totalAngleAt(t, segmentsA, ringA.initialAngle);
    const posB = totalAngleAt(t, segmentsB, ringB.initialAngle);

    const posANorm = ((posA % 360) + 360) % 360;
    const posBNorm = ((posB % 360) + 360) % 360;
    const diff = Math.abs(posANorm - posBNorm);
    const normalizedDiff = Math.min(diff, 360 - diff);

    if (normalizedDiff < propWidthDeg) {
      if (!inZone) {
        inZone = true;
        zoneStart = t;
        zoneStartAngle = Math.min(posANorm, posBNorm) - propWidthDeg / 2;
      }
    } else {
      if (inZone) {
        zones.push({
          startAngle: ((zoneStartAngle % 360) + 360) % 360,
          endAngle: ((((zoneStartAngle + propWidthDeg) % 360) + 360) % 360),
          startTime: zoneStart,
          endTime: t - timeStep,
          severity: normalizedDiff < propWidthDeg * 0.5 ? 'critical' : 'warning',
        });
        hasCollision = true;
        inZone = false;
      }
    }
  }

  if (inZone) {
    zones.push({
      startAngle: ((zoneStartAngle % 360) + 360) % 360,
      endAngle: ((((zoneStartAngle + propWidthDeg) % 360) + 360) % 360),
      startTime: zoneStart,
      endTime: duration,
      severity: 'warning',
    });
    hasCollision = true;
  }

  return { hasCollision, ringIdA: ringA.id, ringIdB: ringB.id, collisionZones: zones };
}

export function verifyTorque(
  segment: MotionSegment,
  ring: TurntableRing
): VerificationItem {
  const targetRad = rpmToRadPerSec(segment.targetRPM);
  const alpha = targetRad / (segment.accelerationTime || 0.1);
  const requiredTorque = ring.momentOfInertia * alpha;

  if (requiredTorque <= ring.motor.ratedTorque) {
    return {
      label: `${ring.name} 扭矩校验`,
      passed: true,
      value: `${requiredTorque.toFixed(1)} N·m`,
      limit: `额定 ${ring.motor.ratedTorque} N·m`,
      severity: 'ok',
    };
  }
  if (requiredTorque <= ring.motor.peakTorque) {
    return {
      label: `${ring.name} 扭矩校验`,
      passed: true,
      value: `${requiredTorque.toFixed(1)} N·m`,
      limit: `峰值 ${ring.motor.peakTorque} N·m (超出额定)`,
      severity: 'warning',
    };
  }
  return {
    label: `${ring.name} 扭矩校验`,
    passed: false,
    value: `${requiredTorque.toFixed(1)} N·m`,
    limit: `峰值 ${ring.motor.peakTorque} N·m`,
    severity: 'danger',
  };
}

export function verifySafety(
  segment: MotionSegment,
  ring: TurntableRing
): VerificationItem {
  const targetRad = rpmToRadPerSec(segment.targetRPM);
  const alpha = targetRad / (segment.accelerationTime || 0.1);
  const tangentialAccel = alpha * ring.radius;

  if (tangentialAccel <= SAFETY_TANGENTIAL_ACCEL) {
    return {
      label: `${ring.name} 安全校验`,
      passed: true,
      value: `${tangentialAccel.toFixed(2)} m/s²`,
      limit: `≤ ${(SAFETY_TANGENTIAL_ACCEL).toFixed(1)} m/s² (0.5g)`,
      severity: 'ok',
    };
  }
  return {
    label: `${ring.name} 安全校验`,
    passed: false,
    value: `${tangentialAccel.toFixed(2)} m/s²`,
    limit: `≤ ${(SAFETY_TANGENTIAL_ACCEL).toFixed(1)} m/s² (0.5g)`,
    severity: 'danger',
  };
}

export function computeCompositeTrajectory(
  segments: MotionSegment[],
  ring: TurntableRing,
  liftStartTime: number,
  liftEndTime: number,
  liftSpeed: number,
  liftStartHeight: number,
  globalStartTime: number,
  globalEndTime: number,
  timeStep: number = 0.1
): { x: number; y: number; z: number; t: number }[] {
  const points: { x: number; y: number; z: number; t: number }[] = [];
  for (let t = globalStartTime; t <= globalEndTime; t += timeStep) {
    const angle = totalAngleAt(t, segments, ring.initialAngle);
    const rad = (angle * Math.PI) / 180;
    let h = liftStartHeight;
    if (t >= liftStartTime && t <= liftEndTime) {
      h = liftStartHeight + liftSpeed * (t - liftStartTime);
    } else if (t > liftEndTime) {
      h = liftStartHeight + liftSpeed * (liftEndTime - liftStartTime);
    }
    points.push({
      x: ring.radius * Math.cos(rad),
      y: ring.radius * Math.sin(rad),
      z: h,
      t,
    });
  }
  return points;
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
