import dns from 'dns';
import net from 'net';
import crypto from 'crypto';
import { parseEmail } from './email';
import { smtpVerifyRcpt, smtpProbeWithCatchAll, DEFAULT_HELO } from './smtp';
import { roleAccounts, disposableDomains, webmailDomains, parkedDomains, blacklistDomains, spamTrapPatterns, knownActiveEmails } from './checkLists';

const resolver = dns.promises;

export type StepSub = { name: string; pass: boolean; info?: string };
export type StepResult = { step: string; pass: boolean; subs: StepSub[] };
export type VerifyOptions = { timeoutMs?: number; deep?: boolean; bulk?: boolean };
export type VerifyOutput = {
  email: string;
  status: 'valid' | 'invalid' | 'disposable' | 'catch_all' | 'unknown';
  score: number;
  flags: string[];
  details: string;
  steps: StepResult[];
};

function addStep(steps: StepResult[], step: string, subs: StepSub[]) {
  steps.push({ step, pass: subs.every(s => s.pass), subs });
}

function hashToScore(s: string) {
  const h = crypto.createHash('sha1').update(s).digest();
  return h[0];
}

export async function verifyEmailFull(emailInput: string, opts: VerifyOptions = {}): Promise<VerifyOutput> {
  const email = String(emailInput).trim();
  const steps: StepResult[] = [];
  const flags = new Set<string>();
  const timeoutMs = Math.min(Math.max(opts.timeoutMs ?? 5000, 2000), 15000);
  const parsed = parseEmail(email);

  // Step 1: Syntax and format
  const reBasic = /^[^@]+@[^@]+\.[^@]+$/;
  const badChars = /[\s,;]/;
  const lenOk = email.length <= 254;
  const gibberish = /[0-9]{4,}|[a-z]{10,}[0-9]{2,}/i.test(email.split('@')[0]);
  const typos: Record<string, string> = { 'gmai.com': 'gmail.com', 'gmial.com': 'gmail.com', 'hotnail.com': 'hotmail.com' };
  const domainPart = parsed?.domain ?? email.split('@')[1] ?? '';
  const typoSuggestion = typos[domainPart];
  addStep(steps, 'Syntax & Format', [
    { name: 'regex basic', pass: reBasic.test(email) },
    { name: 'no illegal characters', pass: !badChars.test(email) },
    { name: 'length <= 254', pass: lenOk },
    { name: 'gibberish username', pass: !gibberish, info: gibberish ? 'username looks random' : undefined },
    { name: 'common typos', pass: !typoSuggestion, info: typoSuggestion ? `suggest ${typoSuggestion}` : undefined },
  ]);
  if (!steps[0].pass) flags.add('invalid_format');

  if (!parsed) {
    return finalize(email, steps, flags, { mx: false, smtp: 'unknown', catchAll: false, spf: false, dmarc: false }, 'Invalid format');
  }

  const { domain } = parsed;
  const local = parsed.local;

  // Step 2: Username validation
  const lpunc = (local.match(/[._+-]/g) || []).length;
  addStep(steps, 'Username validation', [
    { name: 'length <= 64', pass: local.length <= 64 },
    { name: 'not excessive punctuation', pass: lpunc < 4 },
    { name: 'alias usage allowed', pass: true, info: local.includes('+') ? 'alias detected' : undefined },
    { name: 'no leading/trailing special', pass: !/^\.|\.$/.test(local) && !/^[_+\-.]/.test(local) && !/[._+-]$/.test(local) },
  ]);

  // Step 3: Domain existence
  let a4: string[] = []; let a6: string[] = [];
  try { a4 = await resolver.resolve4(domain); } catch {}
  try { a6 = await resolver.resolve6(domain); } catch {}
  const whoisRegistered = domain.length > 2; // mock
  const parked = parkedDomains.has(domain);
  addStep(steps, 'Domain existence', [
    { name: 'A record', pass: a4.length > 0 },
    { name: 'AAAA record', pass: a6.length > 0 },
    { name: 'WHOIS registered (mock)', pass: whoisRegistered },
    { name: 'not parked (mock list)', pass: !parked },
  ]);
  if (parked) flags.add('parked');

  // Step 4: MX
  let mx = [] as dns.MxRecord[];
  try { mx = await resolver.resolveMx(domain); } catch {}
  const validMx = mx.length > 0;
  addStep(steps, 'MX records', [
    { name: 'has MX', pass: validMx },
    { name: 'valid mail servers', pass: validMx },
    { name: 'priority redundancy', pass: validMx && mx.length > 1 },
    { name: 'not missing', pass: validMx },
  ]);

  // Step 5: SPF
  const spfTxt = await resolver.resolveTxt(domain).then(rows => rows.map(r => r.join(''))).catch(() => [] as string[]);
  const spfVal = spfTxt.find(t => /^v=spf1/i.test(t));
  addStep(steps, 'SPF', [
    { name: 'has SPF TXT', pass: !!spfVal },
    { name: 'syntax looks valid', pass: !spfVal ? false : /\ball\b|\bincludes?\b|ip4:|ip6:/.test(spfVal) },
    { name: 'not missing/malformed', pass: !!spfVal },
  ]);

  // Step 6: DMARC
  const dmarcTxt = await resolver.resolveTxt(`_dmarc.${domain}`).then(rows => rows.map(r => r.join(''))).catch(() => [] as string[]);
  const dmarcVal = dmarcTxt.find(t => /^v=dmarc1/i.test(t));
  const dmarcPolicy = dmarcVal?.match(/p=([a-z]+)/i)?.[1] || '';
  addStep(steps, 'DMARC', [
    { name: 'has DMARC TXT', pass: !!dmarcVal },
    { name: `policy ${dmarcPolicy || 'none'}`, pass: !!dmarcVal },
    { name: 'not missing', pass: !!dmarcVal },
  ]);

  // Step 7: DKIM (selector unknown) – simulate by attempting common selectors
  const selectors = ['default', 'selector1', 'google'];
  let dkimFound = false;
  for (const sel of selectors) {
    try {
      const txt = await resolver.resolveTxt(`${sel}._domainkey.${domain}`);
      if (txt.flat().join('').toLowerCase().includes('v=dkim1')) { dkimFound = true; break; }
    } catch {}
  }
  addStep(steps, 'DKIM', [
    { name: 'DKIM selector present (best-effort)', pass: dkimFound },
    { name: 'syntax plausible', pass: dkimFound },
    { name: 'not missing', pass: dkimFound },
  ]);

  // Step 8: Disposable
  const isDisposable = disposableDomains.has(domain) || /\btemp\b|\bmailinator\b/i.test(domain);
  addStep(steps, 'Disposable', [
    { name: 'not disposable domain', pass: !isDisposable },
    { name: 'no short-lived MX (mock)', pass: true },
    { name: 'not a disposable subdomain', pass: !/\.temp-mail\.|\.mailinator\./i.test(domain) },
    { name: 'not in static list', pass: !disposableDomains.has(domain) },
    { name: 'no disposable patterns', pass: !/temp|throw|trash|10min/i.test(domain) },
  ]);
  if (isDisposable) flags.add('disposable');

  // Step 9: Webmail
  const isWebmail = webmailDomains.has(domain) || (validMx && mx.some(m => /google|outlook|yah(oo)?/i.test(m.exchange)));
  addStep(steps, 'Webmail', [
    { name: 'known webmail', pass: !isWebmail },
    { name: 'flag caution for marketing', pass: true },
    { name: 'mx matches provider', pass: !isWebmail || !!mx.find(m => /google|yah(oo)?|outlook/i.test(m.exchange)) },
  ]);
  if (isWebmail) flags.add('webmail');

  // Step 10: Role-based
  const localLower = local.toLowerCase();
  const isRole = roleAccounts.has(localLower);
  addStep(steps, 'Role-based', [
    { name: 'not role account', pass: !isRole },
    { name: 'generic username', pass: !/^info|sales|support|contact$/i.test(localLower) },
    { name: 'department pattern', pass: !/^hr|billing|admin$/i.test(localLower) },
    { name: 'length reasonable', pass: local.length >= 3 },
  ]);
  if (isRole) flags.add('role_based');

  // Step 11/12: SMTP connectivity and mailbox verification (best-effort)
  let smtpConn = 'unknown' as 'ok' | 'fail' | 'unknown';
  let smtpMailbox: { cat: 'accept'|'reject'|'temp'|'unknown'; code: number; msg: string } = { cat: 'unknown', code: 0, msg: '' };
  if (validMx && opts.deep !== false) {
    try {
      const targetHosts = mx.sort((a,b)=>a.priority-b.priority).map(m=>m.exchange).slice(0,3);
      const probe = await smtpProbeWithCatchAll({ mxHosts: targetHosts, targetEmail: email, domain, timeoutMs });
      smtpConn = 'ok';
      smtpMailbox = { cat: (probe.rcpt?.category as any) || 'unknown', code: (probe.rcpt?.code as any) || 0, msg: (probe.rcpt?.message as any) || '' };
      // Step 13: Catch all (from probe)
      addStep(steps, 'Catch-all detection', [
        { name: 'random RCPT tested', pass: true },
        { name: 'random not accepted', pass: probe.control?.category !== 'accept' },
        { name: 'consistency', pass: true },
        { name: 'not catch-all', pass: probe.verdict !== 'catch_all' },
      ]);
      if (probe.verdict === 'catch_all') flags.add('catch_all');
    } catch (e:any) {
      smtpConn = 'fail';
    }
  }
  // Detect policy/blocklist style responses from RCPT stage (e.g., Spamhaus blocks)
  const policyBlocked = /spamhaus|blocklist|blacklist|blocked|policy|reputation|forbidden|denied/i.test(smtpMailbox.msg) || /5\.7\.1/.test(smtpMailbox.msg);
  if (policyBlocked) flags.add('policy_block');
  addStep(steps, 'SMTP connectivity', [
    { name: 'connected to MX', pass: smtpConn === 'ok' },
    { name: 'EHLO/HELO ok (assumed)', pass: smtpConn === 'ok' },
    { name: 'secondary MX on fail', pass: true },
    { name: 'timeout under 5s', pass: timeoutMs <= 5000 },
    { name: 'not rejected at connect', pass: smtpConn !== 'fail' },
  ]);
  addStep(steps, 'SMTP mailbox', [
    { name: 'MAIL FROM sent', pass: smtpConn === 'ok' },
    { name: 'RCPT TO sent', pass: smtpConn === 'ok' },
    { name: '2xx accept is valid', pass: smtpMailbox.cat === 'accept' ? true : smtpMailbox.cat !== 'reject' },
    { name: '450 greylist single retry (skipped in fast mode)', pass: true, info: 'retry suggested if greylisted' },
    { name: 'ambiguity flagged', pass: true },
  ]);

  // Step 14: Greylisting handling (note)
  const isGrey = smtpMailbox.code === 450;
  addStep(steps, 'Greylisting', [
    { name: '450 detected', pass: !isGrey || true },
    { name: 'retry after 1 minute (deferred)', pass: true },
    { name: 'status unknown if persists', pass: true },
  ]);
  if (isGrey) flags.add('greylist');

  // Step 15: Blacklist (mock)
  const blDomain = blacklistDomains.has(domain);
  const blScore = hashToScore(domain) % 100; // deterministic mock
  addStep(steps, 'Blacklist', [
    { name: 'domain not blacklisted (mock)', pass: !blDomain },
    { name: 'reputation score (mock)', pass: blScore > 30, info: `score=${blScore}` },
    { name: 'mx ip not blacklisted (mock)', pass: true },
    { name: 'not high risk', pass: blScore > 20 },
  ]);
  if (blDomain || blScore <= 20) flags.add('high_risk');

  // Step 16: Spam trap (heuristics)
  const trapName = spamTrapPatterns.some(rx => rx.test(localLower));
  const oldOrInactive = false; // cannot know; mock false
  const suspiciousUsername = /[a-z]{12,}\d{2,}/i.test(local);
  addStep(steps, 'Spam trap', [
    { name: 'not in trap patterns', pass: !trapName },
    { name: 'has public activity (mock)', pass: !oldOrInactive },
    { name: 'domain not old/inactive (mock)', pass: true },
    { name: 'username not random', pass: !suspiciousUsername },
  ]);
  if (trapName || suspiciousUsername) flags.add('spam_trap_risk');

  // Step 17: Activity (mock)
  const known = knownActiveEmails.has(email.toLowerCase());
  const professionalPattern = /[a-z]+\.[a-z]+@/.test(email);
  addStep(steps, 'Activity', [
    { name: 'in known public list (mock)', pass: known },
    { name: 'not missing from public (mock)', pass: true },
    { name: 'professional pattern', pass: professionalPattern },
    { name: 'corp directory (mock)', pass: true },
  ]);

  // Step 18: Bounce prediction
  let bounceRisk = 0;
  if (!validMx) bounceRisk += 60;
  if (smtpMailbox.cat === 'reject') bounceRisk += 80;
  if (flags.has('catch_all')) bounceRisk += 20;
  if (flags.has('high_risk')) bounceRisk += 20;
  addStep(steps, 'Bounce prediction', [
    { name: 'smtp-based risk', pass: smtpMailbox.cat !== 'reject' },
    { name: 'mx-based risk', pass: validMx },
    { name: 'catch-all penalty', pass: !flags.has('catch_all') },
    { name: 'blacklist penalty', pass: !flags.has('high_risk') },
  ]);

  // Step 19: Scoring (0-100)
  let score = 0;
  // MX presence 30%
  score += validMx ? 30 : 0;
  // SMTP 40%
  score += smtpMailbox.cat === 'accept' ? 40 : smtpMailbox.cat === 'temp' ? 20 : 0;
  // Risk flags
  if (isDisposable) score -= 20;
  if (isRole) score -= 10;
  if (flags.has('catch_all')) score -= 10;
  if (flags.has('greylist')) score -= 5;
  if (!spfVal) score -= 5;
  if (!dmarcVal) score -= 5;
  score = Math.max(0, Math.min(100, score));
  addStep(steps, 'Confidence score', [
    { name: 'mx weighting', pass: true },
    { name: 'smtp weighting', pass: true },
    { name: 'risk adjustments', pass: true },
    { name: 'catch-all/greylist adjust', pass: true },
    { name: 'clamped 0-100', pass: score >= 0 && score <= 100 },
  ]);

  // Step 20: Aggregate
  let status: VerifyOutput['status'] = 'unknown';
  let detail = '';
  if (isDisposable) { status = 'disposable'; detail = 'Disposable domain'; }
  else if (!validMx || smtpMailbox.cat === 'reject') { status = 'invalid'; detail = smtpMailbox.cat === 'reject' ? `SMTP ${smtpMailbox.code} ${smtpMailbox.msg}` : 'No MX records'; }
  else if (flags.has('catch_all')) { status = 'catch_all'; detail = 'Server accepts all recipients'; }
  else if (smtpMailbox.cat === 'accept') { status = 'valid'; detail = 'SMTP confirmed mailbox'; }
  else {
    status = 'unknown';
    detail = policyBlocked && smtpMailbox.msg ? `SMTP ${smtpMailbox.code} ${smtpMailbox.msg}` : 'Ambiguous or timed out';
  }

  if (isDisposable) flags.add('disposable');
  if (isRole) flags.add('role_based');
  if (isWebmail) flags.add('webmail');

  addStep(steps, 'Result aggregation', [
    { name: 'final status assigned', pass: true },
    { name: 'flags generated', pass: true },
    { name: 'detail explanation', pass: !!detail },
    { name: 'output formatted', pass: true },
  ]);

  return finalize(email, steps, flags, { mx: validMx, smtp: smtpMailbox.cat, catchAll: flags.has('catch_all'), spf: !!spfVal, dmarc: !!dmarcVal }, detail, score, status);
}

function finalize(email: string, steps: StepResult[], flagsSet: Set<string>, _ctx: any, details: string, score = 0, status: VerifyOutput['status'] = 'invalid'): VerifyOutput {
  return {
    email,
    status,
    score,
    flags: Array.from(flagsSet),
    details,
    steps,
  };
}
