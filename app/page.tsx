"use client";
import { useRef, useState } from 'react';
import { ResultsTable, type VerifyRow } from '@/components/ResultsTable';
import { ProgressBar } from '@/components/ProgressBar';
import { Modal } from '@/components/Modal';
import { StepBreakdown } from '@/components/StepBreakdown';

export default function Page() {
  const [singleEmail, setSingleEmail] = useState('');
  const [rows, setRows] = useState<VerifyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{done: number,total: number}|null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [detailRow, setDetailRow] = useState<VerifyRow | null>(null);

  async function verifySingle(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/verify-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: singleEmail }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Verification failed');
      setRows(r => [...r, mapApiToRow(data)]);
    } catch (e:any) {
      setRows(r => [...r, { email: singleEmail, status: 'unknown', score: 0, flags: ['error'], details: e?.message || 'error' }]);
    } finally { setLoading(false); }
  }

  async function verifyBulkCsv(text: string) {
    const emails = parseCsvSimple(text).slice(0, 1000);
    setBulkProgress({ done: 0, total: emails.length });
    const results: VerifyRow[] = [];
    const concurrency = 20;
    let i = 0; let done = 0;
    async function worker() {
      for (;;) {
        const idx = i++;
        if (idx >= emails.length) break;
        try {
          const res = await fetch('/api/verify-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emails[idx] }) });
          const data = await res.json();
          results[idx] = mapApiToRow(data);
        } catch (e:any) {
          results[idx] = { email: emails[idx], status: 'unknown', score: 0, flags: ['error'], details: e?.message || 'error' };
        }
        done++;
        setBulkProgress({ done, total: emails.length });
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, emails.length) }, () => worker()));
    setRows(r => [...r, ...results]);
    setBulkProgress(null);
  }

  function onChooseCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) { alert('Please upload a CSV'); return; }
    file.text().then(verifyBulkCsv);
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold">Verify Emails</h1>
      <p className="text-gray-500 mt-1">20-step verification with up to 75 sub-checks.</p>

      <div className="mt-6 grid md:grid-cols-2 gap-6">
        <section className="p-4 rounded border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <h2 className="font-semibold mb-2">Single Email</h2>
          <form onSubmit={verifySingle} className="flex gap-2" aria-label="Single email verification form">
            <input type="email" className="flex-1 px-3 py-2 rounded border border-gray-300 dark:border-gray-700 bg-transparent" placeholder="name@example.com" value={singleEmail} onChange={(e)=>setSingleEmail(e.target.value)} required aria-label="Email address" />
            <button disabled={loading} className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60" aria-busy={loading} aria-live="polite">
              {loading ? 'Verifying...' : 'Verify'}
            </button>
          </form>
        </section>

        {/* <section className="p-4 rounded border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <h2 className="font-semibold mb-2">Bulk CSV (up to 1,000)</h2>
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onChooseCsv} aria-label="Upload CSV" />
          {bulkProgress && (
            <div className="mt-3">
              <ProgressBar value={bulkProgress.done} total={bulkProgress.total} />
              <div className="text-xs text-gray-500 mt-1">{bulkProgress.done}/{bulkProgress.total}</div>
            </div>
          )}
        </section> */}
      </div>

      <ResultsTable rows={rows} onClear={() => setRows([])} onDetails={(row)=> setDetailRow(row)} />

      <Modal open={!!detailRow} title={detailRow ? `Verification Details — ${detailRow.email}` : 'Details'} onClose={() => setDetailRow(null)}>
        {detailRow?.steps ? (
          <StepBreakdown steps={detailRow.steps} />
        ) : (
          <div className="text-sm text-gray-500">No step data available for this result.</div>
        )}
      </Modal>
    </main>
  );
}

function parseCsvSimple(text: string): string[] {
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

function mapApiToRow(api: any): VerifyRow {
  if (api && api.email) {
    return { email: api.email, status: api.status || 'unknown', score: api.score ?? 0, flags: api.flags || [], details: api.details || '', steps: api.steps || [] };
  }
  return { email: api?.email || 'unknown', status: 'unknown', score: 0, flags: ['error'], details: api?.error || 'failed' };
}
