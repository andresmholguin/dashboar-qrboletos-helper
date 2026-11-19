'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import AppSidebarShell from '@/components/AppSidebarShell';
import ReportsView from '@/components/ReportsView';

export default function InformesPage() {
  const router = useRouter();

  return (
    <AppSidebarShell activeNav="informes" lastUpdatedLabel="hoy 06:00 AM">
      <ReportsView onBack={() => router.push('/')} />
    </AppSidebarShell>
  );
}
