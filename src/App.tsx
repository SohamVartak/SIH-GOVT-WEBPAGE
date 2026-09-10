import React from 'react';
import { useApp } from './context/AppContext';

import { GovHeader } from './components/layout/GovHeader';
import { GovBreadcrumb } from './components/layout/GovBreadcrumb';
import { GovFooter } from './components/layout/GovFooter';

import { ToastContainer } from './components/common/ToastContainer';
import { NotificationsDrawer } from './components/common/NotificationsDrawer';
import { CommandPalette } from './components/common/CommandPalette';
import { BharatAIAssistant } from './components/common/BharatAIAssistant';
import { FloatingChatbotButton } from './components/common/FloatingChatbotButton';
import { SIHDemoModal } from './components/demo/SIHDemoModal';

// Views
import { HomeView } from './components/views/HomeView';
import { DashboardView } from './components/views/DashboardView';
import { UploadWorkflowView } from './components/views/UploadWorkflowView';
import { DataQualityView } from './components/views/DataQualityView';
import AIMatchCenterView from './components/views/AIMatchCenterView';
import { ReviewQueueView } from './components/views/ReviewQueueView';
import { CommonMasterView } from './components/views/CommonMasterView';
import { Material360View } from './components/views/Material360View';
import { ProcurementView } from './components/views/ProcurementView';
import { CPSEManagementView } from './components/views/CPSEManagementView';
import { AuditCenterView } from './components/views/AuditCenterView';
import { AdminView } from './components/views/AdminView';
import { LoginView } from './components/views/LoginView';

// New ERP / Legacy Migration View
import { MaterialMigrationView } from './components/views/MaterialMigrationView';

export const App: React.FC = () => {
  const {
    currentTab,
    setCurrentTab,
  } = useApp();

  React.useEffect(() => {
    const syncRoute = () => {
      if (
        window.location.pathname === '/login'
      ) {
        setCurrentTab('login');
      }
    };

    syncRoute();

    window.addEventListener(
      'popstate',
      syncRoute
    );

    return () =>
      window.removeEventListener(
        'popstate',
        syncRoute
      );
  }, [setCurrentTab]);

  // ==========================================================
  // GOVERNMENT LOGIN PAGE
  // ==========================================================

  if (currentTab === 'login') {
    return (
      <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans">
        <LoginView />
        <ToastContainer />
      </div>
    );
  }

  // ==========================================================
  // ACTIVE VIEW
  // ==========================================================

  const renderActiveView = () => {
    switch (currentTab) {
      case 'home':
        return <HomeView />;

      case 'dashboard':
        return <DashboardView />;

      case 'upload':
        return <UploadWorkflowView />;

      case 'quality':
        return <DataQualityView />;

      case 'ai-match':
        return <AIMatchCenterView />;

      case 'review-queue':
        return <ReviewQueueView />;

      case 'master':
        return <CommonMasterView />;

      case 'material-360':
        return <Material360View />;

      // ======================================================
      // PART SEARCH & DATASHEETS
      // ======================================================

      case 'procurement':
      case 'what-if':
        return <ProcurementView />;

      // ======================================================
      // CPSE MANAGEMENT
      // ======================================================

      case 'cpse':
        return <CPSEManagementView />;

      // ======================================================
      // ERP / LEGACY MATERIAL MIGRATION
      // ======================================================

      case 'migration':
        return <MaterialMigrationView />;

      // ======================================================
      // AUDIT & GOVERNANCE
      // ======================================================

      case 'audit':
        return <AuditCenterView />;

      // ======================================================
      // ADMINISTRATION
      // ======================================================

      case 'admin':
        return <AdminView />;

      default:
        return <HomeView />;
    }
  };

  // ==========================================================
  // MAIN GOVERNMENT PORTAL
  // ==========================================================

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col font-sans selection:bg-amber-500 selection:text-white">

      {/* Government Header */}
      <GovHeader />

      {/* Breadcrumb */}
      <GovBreadcrumb />

      {/* Main Content */}
      <main className="flex-1 w-full min-w-0 bg-[#f8fafc]">
        {renderActiveView()}
      </main>

      {/* Government Footer */}
      <GovFooter />

      {/* Enterprise Overlays */}
      <FloatingChatbotButton />
      <BharatAIAssistant />
      <NotificationsDrawer />
      <CommandPalette />
      <SIHDemoModal />
      <ToastContainer />

    </div>
  );
};

export default App;