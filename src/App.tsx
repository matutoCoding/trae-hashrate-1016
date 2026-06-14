import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import TurntablePage from '@/pages/TurntablePage';
import ChoreographyPage from '@/pages/ChoreographyPage';
import CollisionPage from '@/pages/CollisionPage';
import MonitorPage from '@/pages/MonitorPage';
import TemplatesPage from '@/pages/TemplatesPage';

export default function App() {
  return (
    <Router>
      <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <Sidebar />
        <TopBar />
        <main
          className="pt-16 overflow-auto"
          style={{ marginLeft: 220, height: '100vh' }}
        >
          <div className="p-6">
            <Routes>
              <Route path="/" element={<Navigate to="/turntable" replace />} />
              <Route path="/turntable" element={<TurntablePage />} />
              <Route path="/choreography" element={<ChoreographyPage />} />
              <Route path="/collision" element={<CollisionPage />} />
              <Route path="/monitor" element={<MonitorPage />} />
              <Route path="/templates" element={<TemplatesPage />} />
            </Routes>
          </div>
        </main>
      </div>
    </Router>
  );
}
