import net from 'net';

export const DEFAULT_HELO = process.env.VERIFIER_HELO_DOMAIN || 'verifier.local';

type Result = { category: 'accept' | 'reject' | 'temp' | 'unknown'; code: number; message: string };

function parseCode(line: string): number {
  const m = line.match(/^(\d{3})/);
  return m ? parseInt(m[1], 10) : 0;
}

export async function smtpVerifyRcpt(opts: { mxHost: string; email: string; heloDomain?: string; timeoutMs?: number }): Promise<Result> {
  const { mxHost, email } = opts;
  const helo = opts.heloDomain || DEFAULT_HELO;
  const timeoutMs = Math.max(3000, Math.min(20000, opts.timeoutMs ?? 9000));

  return new Promise<Result>((resolve, reject) => {
    const socket = new net.Socket();
    let buffer = '';
    let settled = false;
    let useNullSender = true;
    let triedNonNull = false;
    const cleanup = () => {
      socket.removeAllListeners();
      if (!socket.destroyed) socket.destroy();
    };

    const finish = (res: Result) => {
      if (settled) return; settled = true; cleanup(); resolve(res);
    };
    const fail = (err: Error) => { if (settled) return; settled = true; cleanup(); reject(err); };

    const send = (line: string) => { socket.write(line + '\r\n'); };

    const t = setTimeout(() => finish({ category: 'temp', code: 0, message: 'timeout' }), timeoutMs);
    const clearT = () => clearTimeout(t);

    let stage: 'greet' | 'ehlo' | 'mail' | 'rcpt' | 'quit' = 'greet';

    const classifyRcpt = (code: number, line: string): Result['category'] => {
      const msg = (line || '').toLowerCase();
      // Positive acknowledgement
      if (code >= 200 && code < 300) return 'accept';

      // Transient errors / greylisting
      if (code === 421 || code === 450 || code === 451 || code === 452) return 'temp';

      // Definite mailbox does not exist patterns
      const hardRej = /(user unknown|unknown user|no such user|mailbox unavailable|mailbox not found|invalid recipient|recipient address rejected|5\.1\.1|5\.1\.0)/i;
      if (hardRej.test(line)) return 'reject';

      // Policy blocks / blocklists / reputation problems should not be treated as invalid mailbox
      const policyBlock = /(spamhaus|blocklist|blacklist|blocked|policy|reputation|forbidden|denied)/i;
      const enhPolicy = /5\.7\.1/; // enhanced status code often used for policy blocks
      if (policyBlock.test(msg) || enhPolicy.test(msg)) return 'temp';

      // STARTTLS required (common on enterprise gateways)
      if (code === 530 || /starttls/.test(msg)) return 'temp';

      // Other 5xx — assume reject unless proven otherwise
      if (code >= 500) return 'reject';

      return 'temp';
    };

    socket.on('data', (data) => {
      buffer += data.toString('utf8');
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';

      for (const line of lines) {
        const code = parseCode(line);
        const cont = /^\d{3}-/.test(line);
        if (cont) continue; // wait for final line without hyphen

        if (stage === 'greet') {
          if (code >= 200 && code < 400) { stage = 'ehlo'; send(`EHLO ${helo}`); }
          else return finish({ category: 'temp', code, message: line });
        } else if (stage === 'ehlo') {
          if (code >= 200 && code < 400) {
            stage = 'mail';
            const fromAddr = useNullSender ? '<>' : '<postmaster@' + helo + '>';
            send('MAIL FROM:' + fromAddr);
          }
          else return finish({ category: 'temp', code, message: line });
        } else if (stage === 'mail') {
          if (code >= 200 && code < 400) { stage = 'rcpt'; send('RCPT TO:<' + email + '>' ); }
          else {
            // If server rejects null sender, retry once with non-null
            if (useNullSender && !triedNonNull && code >= 500) {
              useNullSender = false; triedNonNull = true;
              stage = 'mail';
              const fromAddr = '<postmaster@' + helo + '>';
              send('MAIL FROM:' + fromAddr);
            } else {
              return finish({ category: 'temp', code, message: line });
            }
          }
        } else if (stage === 'rcpt') {
          clearT();
          const cat = classifyRcpt(code, line);
          return finish({ category: cat, code, message: line });
        }
      }
    });

    socket.on('error', fail);
    socket.on('close', () => { /* ignore */ });

    socket.connect(25, mxHost, () => {
      // Wait for greeting before sending anything
    });
  });
}

function randomLocalPart() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `verify-${ts}-${rand}`;
}

export async function smtpProbeWithCatchAll(opts: { mxHosts: string[]; targetEmail: string; domain: string; timeoutMs?: number }) {
  const { mxHosts, targetEmail, domain } = opts;
  const timeoutMs = opts.timeoutMs ?? 9000;
  const hosts = mxHosts.slice(0, 3);
  let last: any = null;
  for (const host of hosts) {
    try {
      const rcpt = await smtpVerifyRcpt({ mxHost: host, email: targetEmail, heloDomain: DEFAULT_HELO, timeoutMs });
      const randomAddr = `${randomLocalPart()}@${domain}`;
      const ctrl = await smtpVerifyRcpt({ mxHost: host, email: randomAddr, heloDomain: DEFAULT_HELO, timeoutMs });
      const verdict = deriveVerdict(rcpt, ctrl);
      return { host, rcpt, control: ctrl, verdict } as const;
    } catch (e) {
      last = e;
      continue;
    }
  }
  return { host: hosts[0], rcpt: { category: 'unknown', code: 0, message: 'unreachable' }, control: { category: 'unknown', code: 0, message: (last as Error)?.message || 'error' }, verdict: 'unknown' as const };
}

function deriveVerdict(rcpt: Result, control: Result): 'exists' | 'does_not_exist' | 'catch_all' | 'unknown' {
  if (rcpt.category === 'reject') return 'does_not_exist';
  if (rcpt.category === 'accept' && control.category === 'reject') return 'exists';
  if (rcpt.category === 'accept' && (control.category === 'accept' || control.category === 'temp')) return 'catch_all';
  return 'unknown';
}
