import { NextRequest } from 'next/server';
import { parseEmail } from '@/lib/email';
import dns from 'dns';
import { smtpVerifyRcpt, smtpProbeWithCatchAll } from '@/lib/smtp';

const resolver = dns.promises;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? '').trim();
    const deep: boolean = body?.deep === undefined ? true : Boolean(body?.deep);
    const parsed = parseEmail(email);
    if (!parsed) {
      return Response.json(
        { ok: false, status: 'invalid_email', message: 'Invalid email format' },
        { status: 400 }
      );
    }

    const { domain } = parsed;

    // Try MX first
    let mxRecords: dns.MxRecord[] = [];
    try {
      mxRecords = await resolver.resolveMx(domain);
    } catch (err) {
      // ignore; we'll try A/AAAA fallback below
    }

    let mxPayload: { exchange: string; priority: number }[] | undefined;
    if (mxRecords && mxRecords.length > 0) {
      const sorted = mxRecords.sort((a, b) => a.priority - b.priority);
      mxPayload = sorted.map(r => ({ exchange: r.exchange, priority: r.priority }));
      // Do not return yet; we may add more info (SPF/DMARC, deep)
    }

    // RFC 5321: if no MX, fallback to address records for implicit MX
    let hasA = false;
    try {
      const a4 = await resolver.resolve4(domain);
      if (a4 && a4.length > 0) hasA = true;
    } catch {}
    if (!hasA) {
      try {
        const a6 = await resolver.resolve6(domain);
        if (a6 && a6.length > 0) hasA = true;
      } catch {}
    }

    // Fetch SPF + DMARC for extra context
    const [spfTxt, dmarcTxt] = await Promise.all([
      resolver
        .resolveTxt(domain)
        .then((rows) => rows.map((r) => r.join('')).filter((t) => t.toLowerCase().startsWith('v=spf1')).join(' '))
        .catch(() => ''),
      resolver
        .resolveTxt(`_dmarc.${domain}`)
        .then((rows) => rows.map((r) => r.join('')).find((t) => t.toLowerCase().startsWith('v=dmarc1')) || '')
        .catch(() => ''),
    ]);

    // Optional SMTP deep check — may be slow/unreliable depending on network
    let deepResult: any = undefined;
    if (deep && (mxPayload?.length || hasA)) {
      const targets = (mxPayload?.map((m) => m.exchange) || [domain]).slice(0, 3);
      try {
        const probe = await smtpProbeWithCatchAll({ mxHosts: targets, targetEmail: email, domain, timeoutMs: 9000 });
        deepResult = probe;
      } catch (e: any) {
        deepResult = { host: targets[0], error: e?.message || 'probe error' };
      }
    }

    if (mxPayload) {
      return Response.json({
        ok: true,
        status: 'ok',
        message: `Domain ${domain} has ${mxPayload.length} MX record(s).`,
        domain,
        mx: mxPayload,
        spf: spfTxt || null,
        dmarc: dmarcTxt || null,
        deep: deepResult || null,
      });
    }

    if (hasA) {
      return Response.json({
        ok: true,
        status: 'has_a',
        message: `Domain ${domain} has no MX records but has A/AAAA record(s). Many MTAs will still attempt delivery.`,
        domain,
        mx: [],
        spf: spfTxt || null,
        dmarc: dmarcTxt || null,
        deep: deepResult || null,
      });
    }

    return Response.json({
      ok: false,
      status: 'no_mx',
      message: `Domain ${domain} has no MX records and no fallback A/AAAA records; it likely cannot receive email.`,
      domain,
      mx: [],
      spf: spfTxt || null,
      dmarc: dmarcTxt || null,
      deep: deepResult || null,
    });
  } catch (err: any) {
    return Response.json(
      { ok: false, status: 'error', message: err?.message ?? 'Unexpected error' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email');
  if (!email) {
    return Response.json(
      { ok: false, status: 'invalid_email', message: 'Provide ?email=name@example.com' },
      { status: 400 }
    );
  }
  // Delegate to POST logic for consistency
  return POST(new NextRequest(req.url, { method: 'POST', body: JSON.stringify({ email }) }));
}
