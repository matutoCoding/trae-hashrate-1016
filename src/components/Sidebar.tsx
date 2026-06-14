import { NavLink, useLocation } from 'react-router-dom';
import {
  Settings,
  Play,
  ShieldAlert,
  Activity,
  LayoutTemplate,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { to: '/turntable', icon: Settings, label: '转台录入' },
  { to: '/choreography', icon: Play, label: '运动编排' },
  { to: '/collision', icon: ShieldAlert, label: '碰撞校验' },
  { to: '/monitor', icon: Activity, label: '同步监控' },
  { to: '/templates', icon: LayoutTemplate, label: '模板库' },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  return (
    <aside
      className="fixed left-0 top-0 h-full z-40 flex flex-col transition-all duration-300"
      style={{
        width: collapsed ? 64 : 220,
        backgroundColor: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border)',
      }}
    >
      <div
        className="flex items-center gap-3 px-4 h-16 shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center font-display font-bold text-lg"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--bg-primary)' }}
        >
          SR
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <div className="font-display font-bold text-sm leading-tight" style={{ color: 'var(--text-primary)' }}>
              StageRig
            </div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              转台联动控制
            </div>
          </div>
        )}
      </div>

      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group"
              style={{
                backgroundColor: isActive ? 'var(--accent-dim)' : 'transparent',
                color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
              }}
              title={collapsed ? item.label : undefined}
            >
              <item.icon
                size={20}
                className="shrink-0"
                style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)' }}
              />
              {!collapsed && (
                <span className="text-sm font-medium truncate">{item.label}</span>
              )}
            </NavLink>
          );
        })}
      </nav>

      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-center h-10 shrink-0 transition-colors"
        style={{
          borderTop: '1px solid var(--border)',
          color: 'var(--text-muted)',
        }}
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </aside>
  );
}
