'use client';

import { useEffect } from 'react';

export default function LoginRedirect() {
  useEffect(() => {
    window.location.replace(window.location.origin + '/login');
  }, []);

  return null;
}
