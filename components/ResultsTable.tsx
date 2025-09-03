"use client";
import React from 'react';

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
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">Results</h2>
        {onClear && (
          <button onClick={onClear} className="px-3 py-1.5 text-sm rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700">Clear Results</button>
        )}
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
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                <td className="p-2 font-mono">{r.email}</td>
                <td className="p-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                    r.status === 'valid' ? 'bg-green-100 text-green-700' :
                    r.status === 'invalid' ? 'bg-red-100 text-red-700' :
                    r.status === 'disposable' ? 'bg-yellow-100 text-yellow-800' :
                    r.status === 'catch_all' ? 'bg-purple-100 text-purple-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>{r.status}</span>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
