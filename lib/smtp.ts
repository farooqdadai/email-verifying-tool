import net from 'net';

type Result = { category: 'accept' | 'reject' | 'temp' | 'unknown'; code: number; message: string };

function parseCode(line: string): number {
  const m = line.match(/^(\d{3})/);
  return m ? parseInt(m[1], 10) : 0;
}

export async function smtpVerifyRcpt(opts: { mxHost: string; email: string; heloDomain?: string; timeoutMs?: number }): Promise<Result> {
  const { mxHost, email } = opts;
  const helo = opts.heloDomain || 'example.com';
  const timeoutMs = Math.max(3000, Math.min(20000, opts.timeoutMs ?? 9000));

  return new Promise<Result>((resolve, reject) => {
    const socket = new net.Socket();
    let buffer = '';
    let settled = false;
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
          if (code >= 200 && code < 400) { stage = 'mail'; send('MAIL FROM:<postmaster@' + helo + '>' ); }
          else return finish({ category: 'temp', code, message: line });
        } else if (stage === 'mail') {
          if (code >= 200 && code < 400) { stage = 'rcpt'; send('RCPT TO:<' + email + '>' ); }
          else return finish({ category: 'temp', code, message: line });
        } else if (stage === 'rcpt') {
          clearT();
          if (code >= 200 && code < 300) return finish({ category: 'accept', code, message: line });
          if (code >= 500) return finish({ category: 'reject', code, message: line });
          return finish({ category: 'temp', code, message: line });
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
      const rcpt = await smtpVerifyRcpt({ mxHost: host, email: targetEmail, heloDomain: domain, timeoutMs });
      const randomAddr = `${randomLocalPart()}@${domain}`;
      const ctrl = await smtpVerifyRcpt({ mxHost: host, email: randomAddr, heloDomain: domain, timeoutMs });
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
