import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ViewHome } from '@/components/layout/ViewHome';
import { TopBar } from '@/components/layout/TopBar';
import { ModalPortal } from '@/components/modals/ModalPortal';
import { ContextMenu } from '@/components/common/ContextMenu';
import { useUiStore } from '@/stores/uiStore';
import { eventBus } from '@/bridge/events';
import { useRepertoireStore } from '@/stores/repertoireStore';
import { TooltipProvider } from '@/contexts/TooltipContext';
import { ReportPage } from '@/components/report/ReportPage';

export function App() {
  /* ── Pont modales vanilles → React ─────────────────── */
  useEffect(() => {
    const handleOpenModal = (data: any) => {
      if (data?.type) useUiStore.getState().openModal(data);
    };
    const handleOpenContextMenu = (data: any) => {
      useUiStore.getState().openCtxMenu(data);
    };
    const handleCloseModals = () => {
      useUiStore.getState().closeModal();
      useUiStore.getState().closeCtxMenu();
    };

    const handleMenuTargetChanged = ({ id }: { id: string | null }) => {
      useRepertoireStore.setState({ menuTargetId: id });
    };

    eventBus.on('openModal', handleOpenModal);
    eventBus.on('openContextMenu', handleOpenContextMenu);
    eventBus.on('closeModals', handleCloseModals);
    eventBus.on('menuTargetChanged', handleMenuTargetChanged);

    return () => {
      eventBus.off('openModal', handleOpenModal);
      eventBus.off('openContextMenu', handleOpenContextMenu);
      eventBus.off('closeModals', handleCloseModals);
      eventBus.off('menuTargetChanged', handleMenuTargetChanged);
    };
  }, []);

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
