import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-paper px-6 text-center">
      <p className="font-mono text-sm text-ink-600">404</p>
      <h1 className="text-lg font-semibold text-ink">That page doesn't exist</h1>
      <Link to="/" className="text-sm font-medium text-signal-blue underline">
        Back to start
      </Link>
    </div>
  );
}
