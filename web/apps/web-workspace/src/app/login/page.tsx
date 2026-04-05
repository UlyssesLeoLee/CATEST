'use client';

import { useEffect } from 'react';

/**
 * SaaS-mode login redirect page.
 * When middleware redirects to /login, basePath turns it into /workspace/login.
 * This page redirects the browser to the gateway's /login (web-base).
 */
export default function LoginRedirect() {
  useEffect(() => {
    window.location.replace(window.location.origin + '/login');
  }, []);

  return null;
}
