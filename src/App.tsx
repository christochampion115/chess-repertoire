import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ViewHome } from '@/components/layout/ViewHome';
import { LegalPage } from '@/components/layout/LegalPage';
import { TopBar } from '@/components/layout/TopBar';
import { ModalPortal } from '@/components/modals/ModalPortal';
import { ContextMenu } from '@/components/common/ContextMenu';
import { TutorialOverlay } from '@/components/common/TutorialOverlay';
import { TooltipProvider } from '@/contexts/TooltipContext';
import { ReportPage } from '@/components/report/ReportPage';
import { bootstrapSession } from '@/services/authService';

export function App() {
  useEffect(() => {
    bootstrapSession();
  }, []);

  return (
    <BrowserRouter>
      <TooltipProvider>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', position: 'relative' }}>
          <TopBar />
          <Routes>
            <Route path="/" element={<ViewHome />} />
            <Route path="/app" element={<AppLayout />} />
            <Route path="/rapport" element={<ReportPage />} />
            <Route path="/mentions-legales" element={<LegalPage title="Mentions légales" />} />
            <Route path="/confidentialite" element={<LegalPage title="Politique de confidentialité" />} />
          </Routes>
          <ModalPortal />
          <ContextMenu />
          <TutorialOverlay />
        </div>
      </TooltipProvider>
    </BrowserRouter>
  );
}
