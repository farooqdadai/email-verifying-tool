"use client";
import React from 'react';

export function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="w-full bg-gray-100 dark:bg-gray-800 rounded overflow-hidden" aria-label="Progress">
      <div className="h-2 bg-blue-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

