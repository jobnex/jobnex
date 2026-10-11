import { createNeonAuth } from '@neondatabase/auth/next/server';

export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL || '',
  cookies: {
    secret: process.env.NEON_AUTH_COOKIE_SECRET || 'a-very-long-secret-key-for-development-only-1234567890',
  },
});

export async function getCurrentUser() {
  const sessionRes = await auth.getSession();
  // Safe type parsing for Neon Auth session response
  if (!sessionRes) return null;
  
  if ('user' in sessionRes && sessionRes.user) {
    return sessionRes.user as { id: string; email?: string; name?: string };
  }
  
  if ('data' in sessionRes && typeof sessionRes.data === 'object' && sessionRes.data !== null) {
    const data = sessionRes.data as { user?: { id: string; email?: string; name?: string } };
    if (data.user) {
      return data.user;
    }
  }
  
  return null;
}
