import { NextRequest } from 'next/server';
import { verifyEmailFull } from '@/lib/verify';
import { checkFreeTier } from '@/lib/rateLimit';

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.ip || 'unknown';
  const { allowed, remaining } = checkFreeTier(ip, 100);
  if (!allowed) {
    return Response.json({ error: 'Free tier limit reached (5/hour).', remaining }, { status: 429 });
  }

  let body: any = {};
  try { body = await req.json(); } catch {}
  const email = String(body?.email ?? '').trim();
  if (!email) return Response.json({ error: 'Missing email' }, { status: 400 });

  const result = await verifyEmailFull(email, { timeoutMs: 5000, deep: true });
  return Response.json(result);
}

