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
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [detailRow, setDetailRow] = useState<VerifyRow | null>(null);
  const [bulkText, setBulkText] = useState('');
  const [mode, setMode] = useState<'single' | 'csv' | 'paste'>('single');

  async function verifySingle(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: singleEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Verification failed');
      setRows((r) => [...r, mapApiToRow(data)]);
    } catch (e: any) {
      setRows((r) => [
        ...r,
        { email: singleEmail, status: 'unknown', score: 0, flags: ['error'], details: e?.message || 'error' },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function verifyBulkCsv(text: string) {
    const emails = parseCsvSimple(text).slice(0, 1000);
    setBulkProgress({ done: 0, total: emails.length });
    const results: VerifyRow[] = [];
    const concurrency = 20;
    let i = 0;
    let done = 0;
    async function worker() {
      for (;;) {
        const idx = i++;
        if (idx >= emails.length) break;
        try {
          const res = await fetch('/api/verify-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: emails[idx] }),
          });
          const data = await res.json();
          results[idx] = mapApiToRow(data);
        } catch (e: any) {
          results[idx] = {
            email: emails[idx],
            status: 'unknown',
            score: 0,
            flags: ['error'],
            details: e?.message || 'error',
          };
        }
        done++;
        setBulkProgress({ done, total: emails.length });
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, emails.length) }, () => worker()));
    setRows((r) => [...r, ...results]);
    setBulkProgress(null);
  }

  function onChooseCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      alert('Please upload a CSV');
      return;
    }
    file.text().then(verifyBulkCsv);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function onVerifyPasted(e: React.FormEvent) {
    e.preventDefault();
    const text = bulkText.trim();
    if (!text) return;
    await verifyBulkCsv(text);
  }

  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold">Verify Emails</h1>
      <p className="text-gray-500 mt-1">20-step verification with up to 75 sub-checks.</p>

      <div className="mt-6">
        <fieldset>
          <legend className="text-sm font-medium text-gray-700 dark:text-gray-300">Choose input method</legend>
          <div className="mt-3 grid sm:grid-cols-3 gap-3">
            <label
              className={`cursor-pointer p-3 rounded-lg border text-sm bg-white dark:bg-gray-900 ${
                mode === 'single'
                  ? 'border-blue-600 ring-2 ring-blue-600'
                  : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
              }`}
            >
              <input
                type="radio"
                name="mode"
                value="single"
                className="sr-only"
                checked={mode === 'single'}
                onChange={() => setMode('single')}
              />
              <div className="font-semibold">Single Email</div>
              <div className="text-xs text-gray-500">Verify one address quickly</div>
            </label>
            <label
              className={`cursor-pointer p-3 rounded-lg border text-sm bg-white dark:bg-gray-900 ${
                mode === 'csv'
                  ? 'border-blue-600 ring-2 ring-blue-600'
                  : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
              }`}
            >
              <input
                type="radio"
                name="mode"
                value="csv"
                className="sr-only"
                checked={mode === 'csv'}
                onChange={() => setMode('csv')}
              />
              <div className="font-semibold">Bulk CSV</div>
              <div className="text-xs text-gray-500">Upload up to 1,000 emails</div>
            </label>
            <label
              className={`cursor-pointer p-3 rounded-lg border text-sm bg-white dark:bg-gray-900 ${
                mode === 'paste'
                  ? 'border-blue-600 ring-2 ring-blue-600'
                  : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
              }`}
            >
              <input
                type="radio"
                name="mode"
                value="paste"
                className="sr-only"
                checked={mode === 'paste'}
                onChange={() => setMode('paste')}
              />
              <div className="font-semibold">Paste Emails</div>
              <div className="text-xs text-gray-500">One address per line</div>
            </label>
          </div>
        </fieldset>
      </div>

      <div className="mt-6">
        {mode === 'single' && (
          <section className="p-4 rounded border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            <h2 className="font-semibold mb-2">Single Email</h2>
            <form onSubmit={verifySingle} className="flex gap-2" aria-label="Single email verification form">
              <input
                type="email"
                className="flex-1 px-3 py-2 rounded border border-gray-300 dark:border-gray-700 bg-transparent"
                placeholder="name@example.com"
                value={singleEmail}
                onChange={(e) => setSingleEmail(e.target.value)}
                required
                aria-label="Email address"
              />
              <button
                disabled={loading}
                className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60"
                aria-busy={loading}
                aria-live="polite"
              >
                {loading ? 'Verifying...' : 'Verify'}
              </button>
            </form>
          </section>
        )}

        {mode === 'csv' && (
          <section className="p-4 rounded border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            <h2 className="font-semibold mb-2">Bulk CSV (up to 1,000)</h2>
            <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onChooseCsv} aria-label="Upload CSV" />
            {bulkProgress && (
              <div className="mt-3">
                <ProgressBar value={bulkProgress.done} total={bulkProgress.total} />
                <div className="text-xs text-gray-500 mt-1">{bulkProgress.done}/{bulkProgress.total}</div>
              </div>
            )}
          </section>
        )}

        {mode === 'paste' && (
          <section className="p-4 rounded border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            <h2 className="font-semibold mb-2">Paste Emails (one per line)</h2>
            <form onSubmit={onVerifyPasted} className="flex flex-col gap-3" aria-label="Pasted emails verification form">
              <textarea
                className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-700 bg-transparent font-mono"
                rows={8}
                placeholder={`name1@example.com\nname2@example.com\nname3@example.com`}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                aria-label="Email list textarea"
              />
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={!!bulkProgress || !bulkText.trim()}
                  className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60"
                  aria-busy={!!bulkProgress}
                >
                  {bulkProgress ? 'Verifying...' : 'Verify'}
                </button>
                {bulkProgress && (
                  <span className="text-xs text-gray-500">{bulkProgress.done}/{bulkProgress.total}</span>
                )}
              </div>
            </form>
          </section>
        )}
      </div>

      <ResultsTable rows={rows} onClear={() => setRows([])} onDetails={(row) => setDetailRow(row)} />

      <Modal
        open={!!detailRow}
        title={detailRow ? `Verification Details — ${detailRow.email}` : 'Details'}
        onClose={() => setDetailRow(null)}
      >
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
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const header = lines[0].toLowerCase();
  const idx = header.split(',').indexOf('email');
  if (idx === -1) return lines.map((l) => l.split(',')[0]);
  const emails: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols[idx]) emails.push(cols[idx].trim());
  }
  return emails;
}

function mapApiToRow(api: any): VerifyRow {
  if (api && api.email) {
    return {
      email: api.email,
      status: api.status || 'unknown',
      score: api.score ?? 0,
      flags: api.flags || [],
      details: api.details || '',
      steps: api.steps || [],
    };
  }
  return {
    email: api?.email || 'unknown',
    status: 'unknown',
    score: 0,
    flags: ['error'],
    details: api?.error || 'failed',
  };
}

