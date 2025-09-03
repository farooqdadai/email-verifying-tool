"use client";
import React from 'react';
import type { StepResult } from './ResultsTable';

export function StepBreakdown({ steps }: { steps: StepResult[] }) {
  return (
    <div className="space-y-4">
      {steps.map((s, i) => (
        <div key={i} className="border border-gray-200 dark:border-gray-800 rounded">
          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-t">
            <div className="font-medium">{s.step}</div>
            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${s.pass ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{s.pass ? 'PASS' : 'FAIL'}</span>
          </div>
          <div className="p-3">
            <ul className="space-y-1">
              {s.subs.map((sub, j) => (
                <li key={j} className="flex items-start gap-2">
                  <span className={`inline-block mt-0.5 h-2 w-2 rounded-full ${sub.pass ? 'bg-green-500' : 'bg-red-500'}`} aria-hidden />
                  <div>
                    <div className="text-sm">
                      {sub.name}
                      <span className={`ml-2 text-[10px] uppercase tracking-wide ${sub.pass ? 'text-green-600' : 'text-red-600'}`}>{sub.pass ? 'ok' : 'issue'}</span>
                    </div>
                    {sub.info && <div className="text-xs text-gray-500">{sub.info}</div>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ))}
    </div>
  );
}

