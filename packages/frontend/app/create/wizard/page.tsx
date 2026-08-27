'use client';

/**
 * Guided call creation (FE-02).
 *
 * Mounted alongside the existing single-page form at `/create` rather than
 * replacing it: that page carries live wallet balance and allowance checks
 * through wagmi, and swapping the default creation flow is a product decision
 * rather than a frontend one. Both routes create the same shape of call.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AppLayout } from '@/components/AppLayout';
import { CreateWizard } from '@/src/components/create/CreateWizard';

export default function CreateWizardPage() {
  const router = useRouter();

  return (
    <AppLayout>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
        <h1 className="text-2xl font-bold">Create a call</h1>

        <CreateWizard
          onSubmit={({ values, ipfsCid }) => {
            // The wizard has produced a validated call and pinned its thesis.
            // Submitting it on-chain is the existing create page's job, so for
            // now this hands the user back to the calls list.
            console.info('call ready', { symbol: values.tokenSymbol, ipfsCid });
            router.push('/calls');
          }}
        />
      </div>
    </AppLayout>
  );
}
