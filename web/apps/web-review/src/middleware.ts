import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('session')?.value;
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    pathname === '/icon.png'
  ) {
    return NextResponse.next();
  }

  if (!token) {
    const loginUrl = new URL('/login', `http://localhost:${process.env.NEXT_PUBLIC_PORT_WEB_BASE || 33000}`);
    return NextResponse.redirect(loginUrl);
  }

  try {
    const secretKey = process.env.JWT_HS256_SECRET;
    if (!secretKey) throw new Error('JWT_HS256_SECRET not set');
    const key = new TextEncoder().encode(secretKey);
    await jwtVerify(token, key, { algorithms: ['HS256'] });
    return NextResponse.next();
  } catch (err) {
    const loginUrl = new URL('/login', `http://localhost:${process.env.NEXT_PUBLIC_PORT_WEB_BASE || 33000}`);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
