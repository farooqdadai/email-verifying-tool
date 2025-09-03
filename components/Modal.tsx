"use client";
import React, { useEffect, useRef } from 'react';

export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && open) onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div ref={ref} className="w-full max-w-3xl rounded bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
            <h3 className="font-semibold">{title}</h3>
            <button onClick={onClose} aria-label="Close details" className="px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">✕</button>
          </div>
          <div className="max-h-[70vh] overflow-auto p-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

