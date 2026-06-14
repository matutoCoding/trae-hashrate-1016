import { useState, useRef, useEffect, useCallback } from 'react';
import { useStageStore } from '@/store/stageStore';
import { type MotionSegment, type LiftSegment, type Scene, type MotionScript } from '@/types';
import { generateId, rpmToRadPerSec } from '@/utils/physics';
import { Plus, Trash2, Save, Activity, Clock, ArrowUp } from 'lucide-react';

const PX_PER_SEC = 10;
const TRACK_H = 44;
const LABEL_W = 130;
const RING_PALETTE = ['#00D4AA', '#3B9EFF', '#A78BFA', '#F59E0B', '#EF4444', '#EC4899'];

export default function ChoreographyPage() {
  const {
    rings, lifts, scripts, currentScriptId, setCurrentScriptId,
    addScript, updateScript, addScene, updateScene, removeScene,
    addMotionSegment, updateMotionSegment, removeMotionSegment,
  } = useStageStore();

  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [selectedSegId, setSelectedSegId] = useState<string | null>(null);
  const [formTab, setFormTab] = useState<'motion' | 'lift'>('motion');
  const [saveDialog, setSaveDialog] = useState(false);
  const [scriptName, setScriptName] = useState('');
  const [operator, setOperator] = useState('');

  const [mf, setMf] = useState({
    ringId: '', direction: 1 as 1 | -1, targetRPM: 30,
    startTime: 0, endTime: 5, accelerationTime: 1, decelerationTime: 1,
    curveType: 'trapezoidal' as 'trapezoidal' | 's-curve',
  });

  const [lf, setLf] = useState({
    liftId: '', startTime: 0, endTime: 3, targetHeight: 2, speed: 0.5,
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const script = scripts.find(s => s.id === currentScriptId) ?? null;
  const scene = script?.scenes.find(sc => sc.id === selectedSceneId) ?? null;
  const maxTime = scene ? scene.endTime - scene.startTime : 60;
  const timelineW = maxTime * PX_PER_SEC;

  const ringColorMap = useCallback((): Record<string, string> => {
    const m: Record<string, string> = {};
    rings.forEach((r, i) => { m[r.id] = RING_PALETTE[i % RING_PALETTE.length]; });
    return m;
  }, [rings])();

  const handleNewScript = () => {
    const id = generateId();
    addScript({
      id, name: scriptName || '新编舞脚本', createdAt: Date.now(),
      updatedAt: Date.now(), operator: operator || '', scenes: [],
      rings: [...rings], lifts: [...lifts],
    });
    setCurrentScriptId(id);
    setScriptName('');
    setOperator('');
  };

  const handleSave = () => {
    if (!script) return;
    updateScript(script.id, {
      name: scriptName || script.name,
      operator: operator || script.operator,
    });
    setSaveDialog(false);
  };

  const handleAddScene = () => {
    if (!script) return;
    const id = generateId();
    const lastEnd = script.scenes.length > 0 ? script.scenes[script.scenes.length - 1].endTime : 0;
    addScene(script.id, {
      id, name: `场景 ${script.scenes.length + 1}`,
      startTime: lastEnd, endTime: lastEnd + 30,
      motionSegments: [], liftSegments: [],
    });
    setSelectedSceneId(id);
  };

  const handleAddMotion = () => {
    if (!script || !scene || !mf.ringId) return;
    addMotionSegment(script.id, scene.id, {
      id: generateId(), ringId: mf.ringId, direction: mf.direction,
      targetRPM: mf.targetRPM, startTime: mf.startTime, endTime: mf.endTime,
      accelerationTime: mf.accelerationTime, decelerationTime: mf.decelerationTime,
      curveType: mf.curveType,
    });
  };

  const handleRemoveMotion = (segId: string) => {
    if (!script || !scene) return;
    removeMotionSegment(script.id, scene.id, segId);
    if (selectedSegId === segId) setSelectedSegId(null);
  };

  const handleAddLift = () => {
    if (!script || !scene || !lf.liftId) return;
    updateScene(script.id, scene.id, {
      liftSegments: [...scene.liftSegments, {
        id: generateId(), liftId: lf.liftId, startTime: lf.startTime,
        endTime: lf.endTime, targetHeight: lf.targetHeight, speed: lf.speed,
      }],
    });
  };

  const handleRemoveLift = (segId: string) => {
    if (!script || !scene) return;
    updateScene(script.id, scene.id, {
      liftSegments: scene.liftSegments.filter(s => s.id !== segId),
    });
  };

  const drawCurve = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scene || !selectedSegId) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const seg = scene.motionSegments.find(s => s.id === selectedSegId);
    if (!seg) return;

    const W = canvas.width;
    const H = canvas.height;
    const pad = { t: 20, r: 20, b: 30, l: 55 };
    const pW = W - pad.l - pad.r;
    const pH = H - pad.t - pad.b;

    ctx.fillStyle = '#1A1F2E';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = '#2D3548';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t);
    ctx.lineTo(pad.l, H - pad.b);
    ctx.lineTo(W - pad.r, H - pad.b);
    ctx.stroke();

    const dur = seg.endTime - seg.startTime;
    const maxV = rpmToRadPerSec(seg.targetRPM);
    const dir = seg.direction;
    const aD = seg.accelerationTime;
    const dD = seg.decelerationTime;
    const sD = dur - aD - dD;
    const tR = maxV * dir;

    ctx.strokeStyle = 'rgba(45,53,72,0.5)';
    ctx.lineWidth = 0.5;
    for (let i = 1; i <= 4; i++) {
      const y = pad.t + (pH * i) / 4;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(W - pad.r, y);
      ctx.stroke();
    }

    ctx.strokeStyle = '#00D4AA';
    ctx.lineWidth = 2;
    ctx.beginPath();

    const steps = 200;
    for (let i = 0; i <= steps; i++) {
      const elapsed = (dur * i) / steps;
      let v = 0;
      if (seg.curveType === 'trapezoidal') {
        if (elapsed < aD) v = tR * (elapsed / aD);
        else if (elapsed < aD + sD) v = tR;
        else v = tR * (1 - (elapsed - aD - sD) / dD);
      } else {
        if (elapsed < aD) {
          const p = elapsed / aD;
          v = tR * (3 * p * p - 2 * p * p * p);
        } else if (elapsed < aD + sD) {
          v = tR;
        } else {
          const p = (elapsed - aD - sD) / dD;
          v = tR * (1 - 3 * p * p + 2 * p * p * p);
        }
      }
      const x = pad.l + (i / steps) * pW;
      const y = pad.t + pH - (Math.abs(v) / maxV) * pH * 0.9;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.lineTo(pad.l + pW, H - pad.b);
    ctx.lineTo(pad.l, H - pad.b);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,212,170,0.08)';
    ctx.fill();

    ctx.fillStyle = '#8B949E';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('t (s)', W / 2, H - 4);
    ctx.textAlign = 'right';
    ctx.fillText(`${(tR).toFixed(1)}`, pad.l - 4, pad.t + 4);
    ctx.fillText('0', pad.l - 4, H - pad.b + 4);
    ctx.textAlign = 'center';
    ctx.fillText(`${dur.toFixed(1)}s`, W - pad.r, H - pad.b + 14);
  }, [scene, selectedSegId]);

  useEffect(() => { drawCurve(); }, [drawCurve]);

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-primary)', border: '1px solid var(--border)',
    color: 'var(--text-primary)', borderRadius: 4, padding: '4px 8px',
    fontSize: 13, width: '100%', outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    color: 'var(--text-secondary)', fontSize: 11, marginBottom: 2, display: 'block',
  };

  const btn = (bg: string, disabled?: boolean): React.CSSProperties => ({
    background: bg, color: '#fff', border: 'none', borderRadius: 4,
    padding: '6px 12px', fontSize: 12, cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 600, opacity: disabled ? 0.4 : 1,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
        <span className="font-display" style={{ color: 'var(--text-primary)', fontSize: 18, fontWeight: 700 }}>
          编舞编排
        </span>
        <select
          value={currentScriptId || ''}
          onChange={e => setCurrentScriptId(e.target.value || null)}
          style={{ ...inputStyle, width: 200 }}
        >
          <option value="">选择脚本...</option>
          {scripts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button onClick={handleNewScript} style={btn('var(--accent)')}>
          <Plus size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />新建脚本
        </button>
        {script && (
          <button onClick={() => { setSaveDialog(true); setScriptName(script.name); setOperator(script.operator); }} style={btn('#3B9EFF')}>
            <Save size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />保存脚本
          </button>
        )}
      </div>

      {saveDialog && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, padding: 12, display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>脚本名称</label>
            <input value={scriptName} onChange={e => setScriptName(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>操作员</label>
            <input value={operator} onChange={e => setOperator(e.target.value)} style={inputStyle} />
          </div>
          <button onClick={handleSave} style={btn('var(--accent)')}>确认保存</button>
          <button onClick={() => setSaveDialog(false)} style={btn('var(--text-muted)')}>取消</button>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, gap: 12, minHeight: 0 }}>
        <div style={{ width: 250, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="font-display" style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 600 }}>场景列表</span>
            <button onClick={handleAddScene} disabled={!script} style={btn('var(--accent)', !script)}>
              <Plus size={14} />
            </button>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: 4 }}>
            {script?.scenes.map(sc => (
              <div
                key={sc.id}
                onClick={() => { setSelectedSceneId(sc.id); setSelectedSegId(null); }}
                style={{
                  padding: '8px 10px', borderRadius: 4, cursor: 'pointer', marginBottom: 2,
                  background: sc.id === selectedSceneId ? 'var(--accent-dim)' : 'transparent',
                  borderLeft: sc.id === selectedSceneId ? '3px solid var(--accent)' : '3px solid transparent',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 500 }}>{sc.name}</span>
                  <Trash2
                    size={13}
                    style={{ color: 'var(--danger)', cursor: 'pointer', opacity: 0.7 }}
                    onClick={e => { e.stopPropagation(); if (script) removeScene(script.id, sc.id); if (selectedSceneId === sc.id) setSelectedSceneId(null); }}
                  />
                </div>
                <div className="font-mono-value" style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>
                  <Clock size={10} style={{ verticalAlign: 'middle', marginRight: 2 }} />
                  {sc.startTime}s – {sc.endTime}s
                </div>
              </div>
            ))}
            {(!script || script.scenes.length === 0) && (
              <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: 20 }}>
                {script ? '暂无场景，点击 + 添加' : '请先创建或选择脚本'}
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 200 }}>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={14} style={{ color: 'var(--accent)' }} />
              <span className="font-display" style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 600 }}>
                时间轴 {scene ? `— ${scene.name}` : ''}
              </span>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              <div style={{ display: 'flex', height: 24, position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-secondary)' }}>
                <div style={{ width: LABEL_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 11, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)' }} />
                <div style={{ position: 'relative', width: timelineW, flexShrink: 0 }}>
                  {Array.from({ length: Math.ceil(maxTime) + 1 }, (_, i) => (
                    <div key={i} style={{ position: 'absolute', left: i * PX_PER_SEC, top: 0 }}>
                      <div style={{ position: 'absolute', bottom: 0, left: 0, width: 1, height: 8, background: 'var(--border)' }} />
                      <span className="font-mono-value" style={{ position: 'absolute', bottom: 9, left: 2, fontSize: 9, color: 'var(--text-muted)' }}>{i}s</span>
                    </div>
                  ))}
                </div>
              </div>

              {rings.map(ring => {
                const segs = scene?.motionSegments.filter(s => s.ringId === ring.id) ?? [];
                return (
                  <div key={ring.id} style={{ display: 'flex', height: TRACK_H, borderBottom: '1px solid var(--border)' }}>
                    <div style={{ width: LABEL_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 5, display: 'flex', alignItems: 'center', padding: '0 8px', background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: ringColorMap[ring.id] || 'var(--accent)', marginRight: 6, flexShrink: 0 }} />
                      <span style={{ color: 'var(--text-secondary)', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ring.name}</span>
                    </div>
                    <div style={{ position: 'relative', width: timelineW, flexShrink: 0 }}>
                      {segs.map(seg => {
                        const left = (seg.startTime - (scene?.startTime ?? 0)) * PX_PER_SEC;
                        const width = (seg.endTime - seg.startTime) * PX_PER_SEC;
                        const isSelected = seg.id === selectedSegId;
                        return (
                          <div
                            key={seg.id}
                            onClick={() => setSelectedSegId(seg.id)}
                            style={{
                              position: 'absolute', left, width: Math.max(width, 4), top: 4, bottom: 4,
                              background: ringColorMap[ring.id] || 'var(--accent)',
                              opacity: isSelected ? 1 : 0.75, borderRadius: 3, cursor: 'pointer',
                              border: isSelected ? '2px solid #fff' : '1px solid rgba(255,255,255,0.15)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              overflow: 'hidden', padding: '0 4px',
                            }}
                          >
                            <span className="font-mono-value" style={{ color: '#fff', fontSize: 10, whiteSpace: 'nowrap', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                              {seg.targetRPM}rpm {seg.direction > 0 ? '↻' : '↺'}
                            </span>
                            <Trash2 size={10} style={{ position: 'absolute', top: 2, right: 2, color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }} onClick={e => { e.stopPropagation(); handleRemoveMotion(seg.id); }} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {lifts.map(lift => {
                const segs = scene?.liftSegments.filter(s => s.liftId === lift.id) ?? [];
                return (
                  <div key={lift.id} style={{ display: 'flex', height: TRACK_H, borderBottom: '1px solid var(--border)' }}>
                    <div style={{ width: LABEL_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 5, display: 'flex', alignItems: 'center', padding: '0 8px', background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)' }}>
                      <ArrowUp size={10} style={{ color: 'var(--warning)', marginRight: 6, flexShrink: 0 }} />
                      <span style={{ color: 'var(--text-secondary)', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lift.name}</span>
                    </div>
                    <div style={{ position: 'relative', width: timelineW, flexShrink: 0 }}>
                      {segs.map(seg => {
                        const left = (seg.startTime - (scene?.startTime ?? 0)) * PX_PER_SEC;
                        const width = (seg.endTime - seg.startTime) * PX_PER_SEC;
                        return (
                          <div
                            key={seg.id}
                            style={{
                              position: 'absolute', left, width: Math.max(width, 4), top: 4, bottom: 4,
                              background: 'var(--warning)', opacity: 0.75, borderRadius: 3,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              overflow: 'hidden', padding: '0 4px',
                            }}
                          >
                            <span className="font-mono-value" style={{ color: '#fff', fontSize: 10, whiteSpace: 'nowrap' }}>
                              {seg.targetHeight}m @ {seg.speed}m/s
                            </span>
                            <Trash2 size={10} style={{ position: 'absolute', top: 2, right: 2, color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }} onClick={() => handleRemoveLift(seg.id)} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {rings.length === 0 && lifts.length === 0 && (
                <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: 40 }}>
                  暂无转台环或升降台数据，请先在转台配置页添加
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
            <div style={{ flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
                <button
                  onClick={() => setFormTab('motion')}
                  style={{
                    flex: 1, padding: '8px', fontSize: 12, fontWeight: 600,
                    background: formTab === 'motion' ? 'var(--accent-dim)' : 'transparent',
                    color: formTab === 'motion' ? 'var(--accent)' : 'var(--text-muted)',
                    border: 'none', borderBottom: formTab === 'motion' ? '2px solid var(--accent)' : '2px solid transparent',
                    cursor: 'pointer',
                  }}
                >
                  旋转段
                </button>
                <button
                  onClick={() => setFormTab('lift')}
                  style={{
                    flex: 1, padding: '8px', fontSize: 12, fontWeight: 600,
                    background: formTab === 'lift' ? 'rgba(255,140,0,0.1)' : 'transparent',
                    color: formTab === 'lift' ? 'var(--warning)' : 'var(--text-muted)',
                    border: 'none', borderBottom: formTab === 'lift' ? '2px solid var(--warning)' : '2px solid transparent',
                    cursor: 'pointer',
                  }}
                >
                  升降段
                </button>
              </div>

              {formTab === 'motion' ? (
                <div style={{ padding: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={labelStyle}>环</label>
                    <select value={mf.ringId} onChange={e => setMf({ ...mf, ringId: e.target.value })} style={inputStyle}>
                      <option value="">选择环...</option>
                      {rings.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>方向</label>
                    <select value={mf.direction} onChange={e => setMf({ ...mf, direction: Number(e.target.value) as 1 | -1 })} style={inputStyle}>
                      <option value={1}>顺时针 (1)</option>
                      <option value={-1}>逆时针 (-1)</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>目标转速 (RPM)</label>
                    <input type="number" value={mf.targetRPM} onChange={e => setMf({ ...mf, targetRPM: Number(e.target.value) })} style={inputStyle} min={0} />
                  </div>
                  <div>
                    <label style={labelStyle}>曲线类型</label>
                    <select value={mf.curveType} onChange={e => setMf({ ...mf, curveType: e.target.value as 'trapezoidal' | 's-curve' })} style={inputStyle}>
                      <option value="trapezoidal">梯形</option>
                      <option value="s-curve">S曲线</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>开始时间 (s)</label>
                    <input type="number" value={mf.startTime} onChange={e => setMf({ ...mf, startTime: Number(e.target.value) })} style={inputStyle} min={0} step={0.1} />
                  </div>
                  <div>
                    <label style={labelStyle}>结束时间 (s)</label>
                    <input type="number" value={mf.endTime} onChange={e => setMf({ ...mf, endTime: Number(e.target.value) })} style={inputStyle} min={0} step={0.1} />
                  </div>
                  <div>
                    <label style={labelStyle}>加速时间 (s)</label>
                    <input type="number" value={mf.accelerationTime} onChange={e => setMf({ ...mf, accelerationTime: Number(e.target.value) })} style={inputStyle} min={0} step={0.1} />
                  </div>
                  <div>
                    <label style={labelStyle}>减速时间 (s)</label>
                    <input type="number" value={mf.decelerationTime} onChange={e => setMf({ ...mf, decelerationTime: Number(e.target.value) })} style={inputStyle} min={0} step={0.1} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <button onClick={handleAddMotion} disabled={!scene} style={btn('var(--accent)', !scene)}>
                      <Plus size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />添加旋转段
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ padding: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={labelStyle}>升降台</label>
                    <select value={lf.liftId} onChange={e => setLf({ ...lf, liftId: e.target.value })} style={inputStyle}>
                      <option value="">选择升降台...</option>
                      {lifts.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>目标高度 (m)</label>
                    <input type="number" value={lf.targetHeight} onChange={e => setLf({ ...lf, targetHeight: Number(e.target.value) })} style={inputStyle} min={0} step={0.1} />
                  </div>
                  <div>
                    <label style={labelStyle}>开始时间 (s)</label>
                    <input type="number" value={lf.startTime} onChange={e => setLf({ ...lf, startTime: Number(e.target.value) })} style={inputStyle} min={0} step={0.1} />
                  </div>
                  <div>
                    <label style={labelStyle}>结束时间 (s)</label>
                    <input type="number" value={lf.endTime} onChange={e => setLf({ ...lf, endTime: Number(e.target.value) })} style={inputStyle} min={0} step={0.1} />
                  </div>
                  <div>
                    <label style={labelStyle}>速度 (m/s)</label>
                    <input type="number" value={lf.speed} onChange={e => setLf({ ...lf, speed: Number(e.target.value) })} style={inputStyle} min={0} step={0.01} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button onClick={handleAddLift} disabled={!scene} style={btn('var(--warning)', !scene)}>
                      <Plus size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />添加升降段
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div style={{ width: 320, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
              <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Activity size={14} style={{ color: 'var(--accent)' }} />
                <span style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 600 }}>速度-时间曲线</span>
              </div>
              <div style={{ padding: 8 }}>
                {selectedSegId && scene ? (
                  <canvas ref={canvasRef} width={588} height={360} style={{ width: '100%', borderRadius: 4 }} />
                ) : (
                  <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                    选择一个运动段预览曲线
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
