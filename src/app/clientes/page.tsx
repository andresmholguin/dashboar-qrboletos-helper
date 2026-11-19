'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import AppSidebarShell from '@/components/AppSidebarShell';
import CustomersView from '@/components/CustomersView';

export default function ClientesPage() {
  const router = useRouter();

  return (
    <AppSidebarShell activeNav="clientes" lastUpdatedLabel="hace un momento">
      <CustomersView onBack={() => router.push('/')} />
    </AppSidebarShell>
  );
}
