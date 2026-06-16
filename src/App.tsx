import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ViewHome } from '@/components/layout/ViewHome';
import { TopBar } from '@/components/layout/TopBar';
import { ModalPortal } from '@/components/modals/ModalPortal';
import { ContextMenu } from '@/components/common/ContextMenu';
import { TooltipProvider } from '@/contexts/TooltipContext';
import { ReportPage } from '@/components/report/ReportPage';

export function App() {
  return (
    <BrowserRouter>
      <TooltipProvider>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
          <TopBar />
          <Routes>
            <Route path="/" element={<ViewHome />} />
            <Route path="/app" element={<AppLayout />} />
            <Route path="/rapport" element={<ReportPage />} />
          </Routes>
        </div>
        <ModalPortal />
        <ContextMenu />
      </TooltipProvider>
    </BrowserRouter>
  );
}
