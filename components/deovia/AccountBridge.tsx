"use client";
import type { AuthChangeEvent } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
export function AccountBridge() {
  const pathname = usePathname();
  useEffect(() => {
    if (/^\/(?:[a-z]{2}\/)?(?:auth|login|onboarding)(?:[/?]|$)/.test(location.pathname)) return;
    let stopped = false;
    const client = createClient();
    const check = async () => {
      try {
        const { data: { user } } = await client.auth.getUser();
        if (stopped) return;
        if (user) {
          const key = `deovia-sync:${user.id}`;
          if (sessionStorage.getItem(key)) return;
          const response = await fetch('/api/deovia/sync', { method: 'POST' });
          if (response.ok) sessionStorage.setItem(key, '1');
          return;
        }
        if (document.cookie.split('; ').some(c => c === 'deovia_signed_out=1') || sessionStorage.getItem('deovia-probe')) return;
        sessionStorage.setItem('deovia-probe', '1');
        const response = await fetch('/api/deovia/status', { cache: 'no-store' });
        if (!response.ok || stopped || !(await response.json()).enabled) return;
        location.replace(`/auth/deovia/start?next=${encodeURIComponent(location.pathname + location.search + location.hash)}`);
      } catch { /* Network failure never gates the local application. */ }
    };
    void check();
    const { data: { subscription } } = client.auth.onAuthStateChange((event: AuthChangeEvent) => {
      if (event === 'SIGNED_OUT') document.cookie = 'deovia_signed_out=1; Path=/; Max-Age=31536000; SameSite=Lax; Secure';
      if (event === 'SIGNED_IN') { document.cookie = 'deovia_signed_out=; Path=/; Max-Age=0; SameSite=Lax; Secure'; }
      if (event === 'SIGNED_IN') setTimeout(() => { if (!stopped) void check(); }, 0);
    });
    return () => { stopped = true; subscription.unsubscribe(); };
  }, [pathname]);
  return null;
}
