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
import { RegisterView } from './components/views/RegisterView';

// ERP / Legacy Migration View
import { MaterialMigrationView } from './components/views/MaterialMigrationView';

export const App: React.FC = () => {
  const {
    currentTab,
    setCurrentTab,
  } = useApp();

  React.useEffect(() => {
    const syncRoute = () => {
      const pathname =
        window.location.pathname;

      if (pathname === '/login') {
        setCurrentTab('login');
        return;
      }

      if (pathname === '/register') {
        setCurrentTab('register');
        return;
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
  // LOGIN PAGE
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
  // REGISTRATION PAGE
  // ==========================================================

  if (currentTab === 'register') {
    return (
      <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans">
        <RegisterView />
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

      case 'procurement':
      case 'what-if':
        return <ProcurementView />;

      case 'cpse':
        return <CPSEManagementView />;

      case 'migration':
        return <MaterialMigrationView />;

      case 'audit':
        return <AuditCenterView />;

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

      <GovHeader />

      <GovBreadcrumb />

      <main className="flex-1 w-full min-w-0 bg-[#f8fafc]">
        {renderActiveView()}
      </main>

      <GovFooter />

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