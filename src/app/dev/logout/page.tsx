/**
 * Dev Logout Page - Quick session clearing for development
 *
 * Navigate to /dev/logout to instantly clear your session and cookies.
 * Only use during development!
 */

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function DevLogoutPage() {
  const router = useRouter();
  const [status, setStatus] = React.useState('Clearing session...');

  React.useEffect(() => {
    const logout = async () => {
      const supabase = createClient();

      // Sign out from Supabase
      await supabase.auth.signOut();

      // Clear all cookies manually
      document.cookie.split(';').forEach((c) => {
        document.cookie = c
          .replace(/^ +/, '')
          .replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
      });

      setStatus('Session cleared! Redirecting...');

      // Redirect to home
      setTimeout(() => {
        router.push('/');
      }, 500);
    };

    logout();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
        <p>{status}</p>
      </div>
    </div>
  );
}
