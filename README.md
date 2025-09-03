Email Verifier (Next.js + Tailwind)

A test-focused email verification site that implements a comprehensive 20-step flow with up to 75 sub-checks inspired by NeverBounce’s methodology: syntax, DNS, SMTP (with RCPT and catch‑all detection), risk signals, and scoring. Supports single email verification and CSV bulk upload (up to 1,000). No persistence is used.

What’s included
- Frontend: Next.js App Router + Tailwind UI, single input + CSV upload, results table, spinner and bulk progress bar, accessible labels.
- Backend: API routes `POST /api/verify-email` and `POST /api/verify-bulk`, in-memory free-tier limiter (5/hour per IP), 20-step engine (`lib/verify.ts`).
- SMTP: best-effort connection + RCPT probe and catch‑all detection.
- DNS: MX, A/AAAA, SPF, DMARC, DKIM (best-effort common selectors).
- Risk: disposable/webmail/role-based/blacklist/spam-trap heuristics, activity mock, scoring & aggregation.

Quick start
1) Install deps (Tailwind, PostCSS, PapaParse, Nodemailer):
   npm install

2) Dev server:
   npm run dev

3) Open:
   http://localhost:3000

Free tier
- Server-side limiter: 5 single verifications per hour per IP for testing. Bulk route is unrestricted but capped to 1,000 emails per upload.

API
- POST /api/verify-email
  Body: { "email": "name@example.com" }
  Returns: { email, status, score, flags, details, steps }

- POST /api/verify-bulk
  Accepts JSON { emails: string[] } or CSV with `email` header or single-column.
  Returns: { count, results: VerifyOutput[] }

Sample CSV
email
email@xyz.com
email2@xyz.com
email4@xyz.com

Testing
- Try: email@xyz.com, email2@xyz.com, email4@xyz.com, user@gmail.com, info@company.com, test@temp-mail.org
- Expect coverage across Valid/Invalid/Disposable/Catch‑All/Unknown.

Notes
- SMTP and DNS checks depend on network access and may be blocked on some networks (e.g., port 25). In such cases the result may be `unknown` with detailed reason.
- DKIM detection uses common default selectors (best-effort) and is not authoritative.
- WHOIS/blacklist/activity checks are mocked for testing as described in the source.

