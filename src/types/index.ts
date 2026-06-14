export interface TurntableRing {
  id: string;
  name: string;
  radius: number;
  momentOfInertia: number;
  maxRPM: number;
  initialAngle: number;
  motor: {
    ratedTorque: number;
    peakTorque: number;
    maxAngularAcceleration: number;
  };
  color: string;
}

export interface LiftPlatform {
  id: string;
  name: string;
  travelRange: number;
  maxSpeed: number;
  maxAcceleration: number;
}

export interface MotionSegment {
  id: string;
  ringId: string;
  direction: 1 | -1;
  targetRPM: number;
  startTime: number;
  endTime: number;
  accelerationTime: number;
  decelerationTime: number;
  curveType: 'trapezoidal' | 's-curve';
}

export interface LiftSegment {
  id: string;
  liftId: string;
  startTime: number;
  endTime: number;
  targetHeight: number;
  speed: number;
}

export interface Scene {
  id: string;
  name: string;
  startTime: number;
  endTime: number;
  motionSegments: MotionSegment[];
  liftSegments: LiftSegment[];
}

export interface MotionScript {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  operator: string;
  scenes: Scene[];
  rings: TurntableRing[];
  lifts: LiftPlatform[];
}

export interface CollisionZone {
  startAngle: number;
  endAngle: number;
  startTime: number;
  endTime: number;
  severity: 'warning' | 'critical';
}

export interface CollisionResult {
  hasCollision: boolean;
  ringIdA: string;
  ringIdB: string;
  collisionZones: CollisionZone[];
}

export interface SyncError {
  ringId: string;
  timestamp: number;
  angleError: number;
  timeError: number;
  isStutter: boolean;
  isJitter: boolean;
}

export interface SyncEvent extends SyncError {
  id: string;
  scriptId: string;
  timeInScript: number;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: number;
}

export interface ScriptVersion {
  id: string;
  scriptId: string;
  version: number;
  note: string;
  createdAt: number;
  createdBy: string;
  snapshot: MotionScript;
}

export interface SafetyReportItem {
  sceneId: string;
  sceneName: string;
  startTime: number;
  endTime: number;
  overSpeedItems: { ringName: string; maxRPM: number; maxVelocity: number; limit: number; peakTime: number }[];
  torqueItems: { ringName: string; value: string; limit: string; severity: 'ok' | 'warning' | 'danger'; peakTime: number }[];
  safetyItems: { ringName: string; value: string; limit: string; severity: 'ok' | 'warning' | 'danger'; peakTime: number }[];
  collisionItems: { ringA: string; ringB: string; startTime: number; endTime: number; severity: 'warning' | 'critical' }[];
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface RiskItem {
  id: string;
  sceneId: string;
  sceneName: string;
  time: number;
  type: 'collision' | 'overspeed' | 'torque' | 'safety';
  severity: 'warning' | 'critical';
  ringIds: string[];
  ringNames: string[];
  description: string;
  score: number;
  suggestion: string;
}

export interface SafetyReport {
  id: string;
  scriptId: string;
  scriptName: string;
  operator: string;
  generatedAt: number;
  performanceDate?: string;
  totalDuration: number;
  overallStatus: 'ok' | 'warning' | 'danger';
  overallRiskScore: number;
  scenes: SafetyReportItem[];
  summary: {
    totalOverSpeed: number;
    totalTorqueWarnings: number;
    totalSafetyWarnings: number;
    totalCollisions: number;
    criticalCollisions: number;
  };
  riskRanking: RiskItem[];
  recommendations: string[];
  scriptSnapshot?: MotionScript;
  acknowledgedEvents?: string[];
}

export interface SyncThreshold {
  angleError: number;
  timeError: number;
  stutterThreshold: number;
}

export interface Template {
  id: string;
  name: string;
  category: string;
  tags: string[];
  description: string;
  script: MotionScript;
  createdAt: number;
  updatedAt: number;
}

export interface VerificationItem {
  label: string;
  passed: boolean;
  value: string;
  limit: string;
  severity: 'ok' | 'warning' | 'danger';
}

export const RING_COLORS = [
  '#00D4AA',
  '#3B9EFF',
  '#A78BFA',
  '#F59E0B',
  '#EF4444',
  '#EC4899',
  '#14B8A6',
  '#6366F1',
];

export const G_ACCEL = 9.8;
export const SAFETY_TANGENTIAL_ACCEL = 0.5 * G_ACCEL;
