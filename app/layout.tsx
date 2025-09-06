import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Email Verifier',
  description: 'Verify email deliverability with MX, SMTP, and more. Free and open-source email verification tool.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
        <header className="sticky top-0 z-10 backdrop-blur bg-white/70 dark:bg-gray-900/60 border-b border-gray-200 dark:border-gray-800">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="font-bold">Email Verifier</div>
            <div className="text-sm text-gray-500">Created By Farooq Dad • @farooqdadai</div>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
