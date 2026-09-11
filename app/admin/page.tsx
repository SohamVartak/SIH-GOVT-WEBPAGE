"use client";

import { AppProvider } from "../../src/context/AppContext";
import AdminView from "../../src/components/views/AdminView";

export default function AdminPage() {
  return (
    <AppProvider>
      <AdminView />
    </AppProvider>
  );
}