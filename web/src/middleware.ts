import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('session')?.value;
  
  if (request.nextUrl.pathname.startsWith('/review')) {
    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    try {
      const secretKey = process.env.JWT_HS256_SECRET;
      if (!secretKey) throw new Error('Configuration error');
      const key = new TextEncoder().encode(secretKey);
      
      // Verify JWT token signature at the Edge
      await jwtVerify(token, key, { algorithms: ['HS256'] });
      
      return NextResponse.next();
    } catch {
      console.error('Invalid token, redirecting to login');
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/review/:path*']
};
