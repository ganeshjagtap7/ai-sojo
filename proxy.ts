import { NextRequest, NextResponse } from 'next/server';
import { createProxyClient } from '@/lib/supabase/proxy';

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });
  const supabase = createProxyClient(request, response);
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
