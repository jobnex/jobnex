import { auth } from '@/lib/auth/server';

export default auth.middleware({
  // Redirects unauthenticated users to sign-in page
  loginUrl: '/auth',
});

export const config = {
  matcher: [
    // Protected routes requiring authentication
    '/job-hunt/:path*',
  ],
};
