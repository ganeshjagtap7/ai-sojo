import { NextRequest, NextResponse } from 'next/server';
import { createProxyClient } from '@/lib/supabase/proxy';

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });
  const supabase = createProxyClient(request, response);

  // Refresh session cookies on every request that matches the matcher.
  const { data: { user } } = await supabase.auth.getUser();

  // Gate /app/* — unauthenticated users get bounced to /login with a return path.
  const { pathname } = request.nextUrl;
  if (pathname.startsWith('/app') && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  // Skip API routes (they read cookies via createClient() directly), Next.js
  // internals, and static assets. Proxy hitting /_next/data during HMR was
  // racing the App Router's client init in dev — keep that exclusion.
  matcher: ['/((?!api|_next/static|_next/image|_next/data|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
