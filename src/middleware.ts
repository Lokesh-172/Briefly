// /middleware.js or /middleware.ts

import { NextResponse } from 'next/server';

export function middleware() {
  // Your middleware logic here
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/auth-callback'],
};
