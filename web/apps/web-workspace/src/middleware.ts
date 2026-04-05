import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

/**
 * Shared Middleware for CATEST Micro-frontends
 * Validates the central JWT cookie provided by web-base.
 */

function redirectToLogin(request: NextRequest) {
  const isSaaS = process.env.NEXT_PUBLIC_SAAS_MODE === 'true';
  if (isSaaS) {
    // In SaaS mode, redirect to /login. Next.js basePath turns this into
    // e.g. /workspace/login, which serves a client-side redirect page
    // (app/login/page.tsx) that navigates to the gateway's /login.
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  return NextResponse.redirect(new URL('/login', `http://localhost:${process.env.NEXT_PUBLIC_PORT_WEB_BASE || 33000}`));
}

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('session')?.value;
  const { pathname } = request.nextUrl;

  // 1. Skip auth for static assets and essential paths
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    pathname === '/icon.png'
  ) {
    return NextResponse.next();
  }

  // 2. Redirect to main login if no token (Distributed Auth Check)
  if (!token) {
    return redirectToLogin(request);
  }

  // 3. Signature Verification
  try {
    const secretKey = process.env.JWT_HS256_SECRET;
    if (!secretKey) throw new Error('JWT_HS256_SECRET not set');
    const key = new TextEncoder().encode(secretKey);

    await jwtVerify(token, key, { algorithms: ['HS256'] });
    return NextResponse.next();
  } catch (err) {
    console.error('Cross-Micro-frontend Auth Failure:', err);
    return redirectToLogin(request);
  }
}

export const config = {
  matcher: ['/', '/((?!api|_next/static|_next/image|favicon.ico|login).+)'],
};
