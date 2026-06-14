import { useState, useRef, useMemo } from 'react';
import {
  LayoutTemplate,
  Plus,
  Search,
  Download,
  Upload,
  Trash2,
  Eye,
  Copy,
  X,
  Save,
} from 'lucide-react';
import { useStageStore } from '@/store/stageStore';
import { type Template, type MotionScript } from '@/types';
import { generateId } from '@/utils/physics';

const CATEGORIES = ['全部', '快速旋转', '场景过渡', '复杂多环', '升降联动', '自定义'];

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function TimelineThumbnail({ script }: { script: MotionScript }) {
  const totalDuration = useMemo(() => {
    let max = 0;
    for (const scene of script.scenes) {
      if (scene.endTime > max) max = scene.endTime;
    }
    return max || 1;
  }, [script]);

  const ringColors = useMemo(() => {
    const map: Record<string, string> = {};
    script.rings.forEach((r) => {
      map[r.id] = r.color;
    });
    return map;
  }, [script]);

  return (
    <svg width="100%" height="48" viewBox="0 0 200 48" preserveAspectRatio="none" style={{ display: 'block' }}>
      {script.scenes.map((scene) =>
        scene.motionSegments.map((seg) => {
          const x1 = (seg.startTime / totalDuration) * 200;
          const x2 = (seg.endTime / totalDuration) * 200;
          const color = ringColors[seg.ringId] || 'var(--accent)';
          const midY = 24;
          const rpmScale = Math.min(seg.targetRPM / 20, 1);
          const barH = 4 + rpmScale * 18;
          return (
            <rect
              key={seg.id}
              x={x1}
              y={midY - barH / 2}
              width={Math.max(x2 - x1, 1)}
              height={barH}
              rx={2}
              fill={color}
              opacity={0.7}
            />
          );
        })
      )}
      <line x1={0} y1={24} x2={200} y2={24} stroke="var(--border)" strokeWidth={0.5} />
    </svg>
  );
}

export default function TemplatesPage() {
  const { templates, scripts, rings, lifts, addTemplate, removeTemplate, addScript, setCurrentScriptId } = useStageStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('全部');
  const [detailTemplate, setDetailTemplate] = useState<Template | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const [saveName, setSaveName] = useState('');
  const [saveCategory, setSaveCategory] = useState('自定义');
  const [saveTags, setSaveTags] = useState('');
  const [saveDescription, setSaveDescription] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      if (activeCategory !== '全部' && t.category !== activeCategory) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const nameMatch = t.name.toLowerCase().includes(q);
        const tagMatch = t.tags.some((tag) => tag.toLowerCase().includes(q));
        const descMatch = t.description.toLowerCase().includes(q);
        if (!nameMatch && !tagMatch && !descMatch) return false;
      }
      return true;
    });
  }, [templates, activeCategory, searchQuery]);

  function handleApplyTemplate(template: Template) {
    const newScript: MotionScript = {
      ...template.script,
      id: generateId(),
      name: `${template.name} (应用)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    addScript(newScript);
    setCurrentScriptId(newScript.id);
  }

  function handleSaveAsTemplate() {
    const currentScript = scripts.find((s) => s.id === useStageStore.getState().currentScriptId);
    if (!currentScript) return;
    const template: Template = {
      id: generateId(),
      name: saveName || currentScript.name,
      category: saveCategory,
      tags: saveTags.split(',').map((t) => t.trim()).filter(Boolean),
      description: saveDescription,
      script: { ...currentScript },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    addTemplate(template);
    setShowSaveModal(false);
    setSaveName('');
    setSaveCategory('自定义');
    setSaveTags('');
    setSaveDescription('');
  }

  function handleExportTemplate(template: Template) {
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${template.name.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportTemplate(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string) as Template;
        if (data.id && data.name && data.script) {
          addTemplate({ ...data, id: generateId(), createdAt: Date.now(), updatedAt: Date.now() });
        }
      } catch {}
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function handleDeleteConfirm() {
    if (deleteConfirmId) {
      removeTemplate(deleteConfirmId);
      setDeleteConfirmId(null);
    }
  }

  const hasCurrentScript = scripts.length > 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LayoutTemplate size={24} style={{ color: 'var(--accent)' }} />
          <h1 className="font-display text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            模板库
          </h1>
          <span className="font-mono-value text-sm px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--accent-dim)', color: 'var(--accent)' }}>
            {templates.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSaveModal(true)}
            disabled={!hasCurrentScript}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200"
            style={{
              backgroundColor: hasCurrentScript ? 'var(--accent)' : 'var(--border)',
              color: hasCurrentScript ? 'var(--bg-primary)' : 'var(--text-muted)',
              cursor: hasCurrentScript ? 'pointer' : 'not-allowed',
            }}
          >
            <Save size={16} />
            保存为模板
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200"
            style={{
              backgroundColor: 'var(--bg-card)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            <Upload size={16} />
            导入
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportTemplate}
            className="hidden"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div
          className="flex items-center gap-2 flex-1 px-4 py-2.5 rounded-lg"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)',
          }}
        >
          <Search size={16} style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索模板名称、标签..."
            className="bg-transparent outline-none flex-1 text-sm"
            style={{ color: 'var(--text-primary)' }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')}>
              <X size={14} style={{ color: 'var(--text-muted)' }} />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className="px-4 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-200"
            style={{
              backgroundColor: activeCategory === cat ? 'var(--accent-dim)' : 'var(--bg-card)',
              color: activeCategory === cat ? 'var(--accent)' : 'var(--text-secondary)',
              border: `1px solid ${activeCategory === cat ? 'var(--accent)' : 'var(--border)'}`,
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {filteredTemplates.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-20 rounded-xl"
          style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          <LayoutTemplate size={48} style={{ color: 'var(--text-muted)' }} />
          <p className="mt-4 text-sm" style={{ color: 'var(--text-muted)' }}>
            {searchQuery || activeCategory !== '全部' ? '未找到匹配的模板' : '暂无模板，请保存或导入模板'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredTemplates.map((template) => (
            <div
              key={template.id}
              className="group rounded-xl overflow-hidden transition-all duration-200"
              style={{
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent)';
                e.currentTarget.style.boxShadow = '0 0 20px rgba(0, 212, 170, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div
                className="px-4 pt-4 pb-2"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <TimelineThumbnail script={template.script} />
              </div>

              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display font-semibold text-base truncate" style={{ color: 'var(--text-primary)' }}>
                    {template.name}
                  </h3>
                  <span
                    className="text-xs px-2 py-0.5 rounded shrink-0"
                    style={{ backgroundColor: 'var(--accent-dim)', color: 'var(--accent)' }}
                  >
                    {template.category}
                  </span>
                </div>

                <p className="text-xs line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                  {template.description || '无描述'}
                </p>

                {template.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {template.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <span className="font-mono-value">{formatDate(template.createdAt)}</span>
                  <span>·</span>
                  <span>{template.script.scenes.length} 场景</span>
                  <span>·</span>
                  <span>{template.script.rings.length} 环</span>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => setDetailTemplate(template)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition-colors"
                    style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                  >
                    <Eye size={13} />
                    详情
                  </button>
                  <button
                    onClick={() => handleApplyTemplate(template)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition-colors"
                    style={{ backgroundColor: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid transparent' }}
                  >
                    <Copy size={13} />
                    应用
                  </button>
                  <button
                    onClick={() => handleExportTemplate(template)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition-colors"
                    style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                  >
                    <Download size={13} />
                    导出
                  </button>
                  <div className="flex-1" />
                  <button
                    onClick={() => setDeleteConfirmId(template.id)}
                    className="flex items-center gap-1 px-2 py-1.5 rounded text-xs transition-colors"
                    style={{ color: 'var(--danger)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--danger-dim)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {detailTemplate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          onClick={() => setDetailTemplate(null)}
        >
          <div
            className="w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-xl animate-fade-in"
            style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between px-6 py-4 sticky top-0 z-10"
              style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}
            >
              <h2 className="font-display font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
                {detailTemplate.name}
              </h2>
              <button
                onClick={() => setDetailTemplate(null)}
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-card)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="flex items-center gap-3">
                <span
                  className="text-sm px-3 py-1 rounded"
                  style={{ backgroundColor: 'var(--accent-dim)', color: 'var(--accent)' }}
                >
                  {detailTemplate.category}
                </span>
                {detailTemplate.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs px-2 py-0.5 rounded"
                    style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-muted)' }}
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <div>
                <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>描述</div>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {detailTemplate.description || '无描述'}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div
                  className="px-4 py-3 rounded-lg text-center"
                  style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
                >
                  <div className="font-mono-value text-xl font-bold" style={{ color: 'var(--accent)' }}>
                    {detailTemplate.script.rings.length}
                  </div>
                  <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>转台环</div>
                </div>
                <div
                  className="px-4 py-3 rounded-lg text-center"
                  style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
                >
                  <div className="font-mono-value text-xl font-bold" style={{ color: 'var(--accent)' }}>
                    {detailTemplate.script.scenes.length}
                  </div>
                  <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>场景</div>
                </div>
                <div
                  className="px-4 py-3 rounded-lg text-center"
                  style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
                >
                  <div className="font-mono-value text-xl font-bold" style={{ color: 'var(--accent)' }}>
                    {detailTemplate.script.lifts.length}
                  </div>
                  <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>升降台</div>
                </div>
              </div>

              <div>
                <div className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>时间线预览</div>
                <div
                  className="rounded-lg overflow-hidden"
                  style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', padding: '8px' }}
                >
                  <TimelineThumbnail script={detailTemplate.script} />
                </div>
              </div>

              <div>
                <div className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>转台参数</div>
                <div className="space-y-1">
                  {detailTemplate.script.rings.map((ring) => (
                    <div
                      key={ring.id}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs"
                      style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
                    >
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: ring.color }} />
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{ring.name}</span>
                      <span className="font-mono-value" style={{ color: 'var(--text-secondary)' }}>
                        R={ring.radius}m
                      </span>
                      <span className="font-mono-value" style={{ color: 'var(--text-secondary)' }}>
                        {ring.maxRPM} RPM
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>运动段</div>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {detailTemplate.script.scenes.map((scene) => (
                    <div key={scene.id}>
                      <div className="text-xs font-medium px-3 py-1.5" style={{ color: 'var(--text-primary)' }}>
                        {scene.name}
                        <span className="ml-2 font-mono-value" style={{ color: 'var(--text-muted)' }}>
                          {scene.startTime}s - {scene.endTime}s
                        </span>
                      </div>
                      {scene.motionSegments.map((seg) => {
                        const ring = detailTemplate.script.rings.find((r) => r.id === seg.ringId);
                        return (
                          <div
                            key={seg.id}
                            className="flex items-center gap-2 px-4 py-1.5 text-xs"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ring?.color || 'var(--accent)' }} />
                            <span>{ring?.name || seg.ringId}</span>
                            <span className="font-mono-value">{seg.targetRPM} RPM</span>
                            <span style={{ color: seg.direction === 1 ? 'var(--accent)' : 'var(--warning)' }}>
                              {seg.direction === 1 ? '顺时针' : '逆时针'}
                            </span>
                            <span className="font-mono-value" style={{ color: 'var(--text-muted)' }}>
                              {seg.curveType === 's-curve' ? 'S曲线' : '梯形'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  创建于 {formatDate(detailTemplate.createdAt)}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      handleApplyTemplate(detailTemplate);
                      setDetailTemplate(null);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    style={{ backgroundColor: 'var(--accent)', color: 'var(--bg-primary)' }}
                  >
                    <Copy size={14} />
                    应用模板
                  </button>
                  <button
                    onClick={() => {
                      handleExportTemplate(detailTemplate);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                  >
                    <Download size={14} />
                    导出
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSaveModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          onClick={() => setShowSaveModal(false)}
        >
          <div
            className="w-full max-w-md rounded-xl animate-fade-in"
            style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between px-6 py-4"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <h2 className="font-display font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
                保存为模板
              </h2>
              <button
                onClick={() => setShowSaveModal(false)}
                className="p-1.5 rounded-lg"
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>模板名称</label>
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="输入模板名称"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                />
              </div>

              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>分类</label>
                <select
                  value={saveCategory}
                  onChange={(e) => setSaveCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {CATEGORIES.filter((c) => c !== '全部').map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>标签（逗号分隔）</label>
                <input
                  type="text"
                  value={saveTags}
                  onChange={(e) => setSaveTags(e.target.value)}
                  placeholder="如: 快速, 过渡, 双环"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                />
              </div>

              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>描述</label>
                <textarea
                  value={saveDescription}
                  onChange={(e) => setSaveDescription(e.target.value)}
                  placeholder="输入模板描述"
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors resize-none"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowSaveModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border)',
                  }}
                >
                  取消
                </button>
                <button
                  onClick={handleSaveAsTemplate}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--bg-primary)' }}
                >
                  <Plus size={14} />
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          onClick={() => setDeleteConfirmId(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl animate-fade-in"
            style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 text-center space-y-4">
              <div
                className="w-12 h-12 rounded-full mx-auto flex items-center justify-center"
                style={{ backgroundColor: 'var(--danger-dim)' }}
              >
                <Trash2 size={20} style={{ color: 'var(--danger)' }} />
              </div>
              <div>
                <h3 className="font-display font-bold text-base" style={{ color: 'var(--text-primary)' }}>
                  确认删除
                </h3>
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                  此操作不可撤销，确定要删除该模板吗？
                </p>
              </div>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="px-5 py-2 rounded-lg text-sm font-medium"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border)',
                  }}
                >
                  取消
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  className="px-5 py-2 rounded-lg text-sm font-medium"
                  style={{ backgroundColor: 'var(--danger)', color: '#ffffff' }}
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
