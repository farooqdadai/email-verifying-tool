import { NextRequest } from 'next/server';
import { verifyEmailFull } from '@/lib/verify';

async function parseCsv(text: string): Promise<string[]> {
  // Simple CSV parser compatible with header "email" and one column per line.
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const header = lines[0].toLowerCase();
  const idx = header.split(',').indexOf('email');
  if (idx === -1) return lines.map(l => l.split(',')[0]);
  const emails: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols[idx]) emails.push(cols[idx].trim());
  }
  return emails;
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') || '';
  let emails: string[] = [];
  if (contentType.includes('application/json')) {
    const body = await req.json().catch(() => ({} as any));
    emails = Array.isArray(body?.emails) ? body.emails.slice(0, 1000) : [];
  } else if (contentType.includes('text/csv')) {
    const text = await req.text();
    emails = (await parseCsv(text)).slice(0, 1000);
  } else if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    const file = form.get('file');
    if (file && typeof file !== 'string') {
      const text = await file.text();
      emails = (await parseCsv(text)).slice(0, 1000);
    }
  }

  if (!emails || emails.length === 0) {
    return Response.json({ error: 'No emails provided. Expect JSON { emails: [] } or CSV with header email.' }, { status: 400 });
  }

  const concurrency = 20;
  let idx = 0, done = 0;
  const results: any[] = [];
  async function worker() {
    for (;;) {
      const i = idx++;
      if (i >= emails.length) break;
      try {
        const r = await verifyEmailFull(emails[i], { timeoutMs: 5000, deep: true, bulk: true });
        results[i] = r;
      } catch (e:any) {
        results[i] = { email: emails[i], status: 'unknown', score: 0, flags: ['error'], details: e?.message || 'error', steps: [] };
      }
      done++;
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, emails.length) }, () => worker()));

  return Response.json({ count: emails.length, results });
}

