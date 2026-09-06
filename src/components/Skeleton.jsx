import React from 'react';

export function SkeletonLine({ className = '' }) {
  return <div className={`animate-pulse bg-line/70 ${className}`} />;
}

export function SkeletonRows({ rows = 4, cols = 4 }) {
  return (
    <div className="border-2 border-line">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className={`flex gap-4 px-4 py-3 ${r % 2 ? 'bg-white' : 'bg-paper'}`}>
          {Array.from({ length: cols }).map((_, c) => (
            <SkeletonLine key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 3 }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="border-2 border-line bg-white p-4">
          <SkeletonLine className="h-3 w-1/3" />
          <SkeletonLine className="mt-2 h-5 w-2/3" />
          <SkeletonLine className="mt-3 h-8 w-1/2" />
        </div>
      ))}
    </div>
  );
}
