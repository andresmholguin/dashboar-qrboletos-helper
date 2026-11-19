'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import AppSidebarShell from '@/components/AppSidebarShell';
import MasivosView from '@/components/MasivosView';

function MasivosPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get('tab');
  const [tab, setTab] = useState<'sender' | 'analytics'>(
    tabParam === 'analytics' ? 'analytics' : 'sender'
  );

  useEffect(() => {
    if (tabParam === 'analytics') setTab('analytics');
    else if (tabParam === 'sender') setTab('sender');
  }, [tabParam]);

  const handleSelectTab = (nextTab: 'sender' | 'analytics') => {
    setTab(nextTab);
    router.replace(nextTab === 'analytics' ? '/masivos?tab=analytics' : '/masivos?tab=sender', {
      scroll: false,
    });
  };

  return (
    <AppSidebarShell
      activeNav={tab === 'analytics' ? 'analitica' : 'masivos'}
      onSelectMasivosTab={handleSelectTab}
      lastUpdatedLabel="hace un momento"
    >
      <MasivosView externalTab={tab} onExternalTabChange={handleSelectTab} />
    </AppSidebarShell>
  );
}

export default function MasivosPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
      <MasivosPageContent />
    </Suspense>
  );
}
