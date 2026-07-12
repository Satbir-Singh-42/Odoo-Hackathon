'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import Loading from '../loading';

const GuidePage = dynamic(() => import('@/components/GuidePage').then(mod => mod.GuidePage), {
  loading: () => <Loading />,
  ssr: false
});

export default function GuideRoute() {
  return (
    <Suspense fallback={<Loading />}>
      <GuidePage />
    </Suspense>
  );
}
