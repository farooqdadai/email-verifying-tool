"use client";
import React, { useEffect, useMemo, useState } from 'react';

export type StepSub = { name: string; pass: boolean; info?: string };
export type StepResult = { step: string; pass: boolean; subs: StepSub[] };

export type VerifyRow = {
  email: string;
  status: 'valid' | 'invalid' | 'disposable' | 'catch_all' | 'unknown';
  score: number; // 0-100
  flags: string[];
  details: string;
  steps?: StepResult[];
};

export function ResultsTable({ rows, onClear, onDetails }: { rows: VerifyRow[]; onClear?: () => void; onDetails?: (row: VerifyRow) => void }) {
  const [statusFilter, setStatusFilter] = useState<'all' | VerifyRow['status']>('all');
  const [pageSize, setPageSize] = useState<number>(25);
  const [page, setPage] = useState<number>(1);
  const [devMode, setDevMode] = useState<boolean>(false);

  // Reset to first page on filter or rows change
  useEffect(() => {
    setPage(1);
  }, [statusFilter, rows]);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return rows;
    return rows.filter((r) => r.status === statusFilter);
  }, [rows, statusFilter]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const start = (clampedPage - 1) * pageSize;
  const current = filtered.slice(start, start + pageSize);

  return (
    <div className="mt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-2">
        <h2 className="text-lg font-semibold">Results</h2>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm flex items-center gap-2">
            <input
              type="checkbox"
              checked={devMode}
              onChange={(e) => setDevMode(e.target.checked)}
            />
            <span className="text-gray-700 dark:text-gray-300">Developer debug</span>
          </label>
          <label className="text-sm flex items-center gap-2">
            <span className="text-gray-600 dark:text-gray-300">Filter:</span>
            <select
              className="text-sm px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-transparent"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              aria-label="Filter results by status"
            >
              <option value="all">All</option>
              <option value="valid">valid</option>
              <option value="invalid">invalid</option>
              <option value="disposable">disposable</option>
              <option value="catch_all">catch_all</option>
              <option value="unknown">unknown</option>
            </select>
          </label>
          <label className="text-sm flex items-center gap-2">
            <span className="text-gray-600 dark:text-gray-300">Per page:</span>
            <select
              className="text-sm px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-transparent"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              aria-label="Rows per page"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
              <option value={1000}>1000</option>
            </select>
          </label>
          {onClear && (
            <button
              onClick={onClear}
              className="px-3 py-1.5 text-sm rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
            >
              Clear Results
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="text-left p-2 font-medium">Email</th>
              <th className="text-left p-2 font-medium">Status</th>
              <th className="text-left p-2 font-medium">Score</th>
              <th className="text-left p-2 font-medium">Flags</th>
              <th className="text-left p-2 font-medium">Reason</th>
              <th className="text-left p-2 font-medium">More</th>
              {devMode && <th className="text-left p-2 font-medium">Debug Hints</th>}
            </tr>
          </thead>
          <tbody>
            {current.length === 0 ? (
              <tr>
                <td className="p-3 text-sm text-gray-500" colSpan={devMode ? 7 : 6}>No results</td>
              </tr>
            ) : (
              current.map((r, i) => (
                <tr key={start + i} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="p-2 font-mono">{r.email}</td>
                  <td className="p-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-semibold ${r.status === 'valid'
                          ? 'bg-green-100 text-green-700'
                          : r.status === 'invalid'
                            ? 'bg-red-100 text-red-700'
                            : r.status === 'disposable'
                              ? 'bg-yellow-100 text-yellow-800'
                              : r.status === 'catch_all'
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-gray-100 text-gray-700'
                        }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="p-2">{r.score}</td>
                  <td className="p-2">
                    <div className="flex gap-1 flex-wrap">
                      {r.flags.map((f, j) => (
                        <span key={j} className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-xs">{f}</span>
                      ))}
                    </div>
                  </td>
                  <td className="p-2 whitespace-pre-wrap max-w-xl">{r.details}</td>
                  <td className="p-2">
                    <button
                      className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
                      onClick={() => onDetails && onDetails(r)}
                      disabled={!r.steps}
                      aria-label={`View detailed checks for ${r.email}`}
                    >
                      Details
                    </button>
                  </td>
                  {devMode && (
                    <td className="p-2 text-xs text-gray-600 dark:text-gray-300">
                      <ul className="list-disc list-inside space-y-0.5">
                        {buildDebugHints(r).map((h, idx) => (
                          <li key={idx}>{h}</li>
                        ))}
                      </ul>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm mt-3">
        <div className="text-gray-500">
          Showing {total === 0 ? 0 : start + 1}-{Math.min(start + pageSize, total)} of {total}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="px-2 py-1 rounded border border-gray-300 dark:border-gray-700 disabled:opacity-50"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={clampedPage <= 1}
            aria-label="Previous page"
          >
            Prev
          </button>
          <span className="px-2">Page {clampedPage} / {totalPages}</span>
          <button
            className="px-2 py-1 rounded border border-gray-300 dark:border-gray-700 disabled:opacity-50"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={clampedPage >= totalPages}
            aria-label="Next page"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function buildDebugHints(r: VerifyRow): string[] {
  const tips: string[] = [];
  const details = String(r.details || '').toLowerCase();
  const hasError = r.flags?.includes('error') || /timeout|probe|error|fail|refused|blocked/.test(details);

  if (r.status === 'unknown') {
    if (hasError) {
      tips.push('Retry with higher timeout (e.g., 8–10s).');
      tips.push('Reduce concurrency when bulk verifying (e.g., 5–10).');
      tips.push('Ensure outbound DNS/SMTP is allowed from server.');
    } else {
      tips.push('Try deep SMTP probe against multiple MX hosts.');
      tips.push('Re-verify later in case of greylisting/temporary 4xx.');
    }
  }

  if (r.status === 'catch_all') {
    tips.push('Use a non-existent user probe to confirm catch-all.');
    tips.push('Score more conservatively; require domain reputation.');
  }

  if (r.status === 'disposable') {
    tips.push('Auto-reject or require secondary verification step.');
  }

  if (r.status === 'invalid') {
    tips.push('Normalize input and re-validate syntax before probing.');
  }

  if (r.status === 'valid' && r.score < 80) {
    tips.push('Consider raising score using SPF/DMARC presence.');
  }

  if (/no mx/.test(details)) {
    tips.push('Fallback to A/AAAA per RFC 5321; delivery may still work.');
  }

  if (tips.length === 0) {
    tips.push('No specific hints. Inspect step breakdown for nuance.');
  }

  return tips.slice(0, 6);
}
