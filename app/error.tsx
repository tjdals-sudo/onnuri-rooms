"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="card max-w-md p-6 text-center">
        <h1 className="text-xl font-bold">문제가 생겼습니다</h1>
        <p className="mt-2 text-muted">{error.message || "잠시 후 다시 시도해 주세요."}</p>
        <button className="btn btn-primary mt-4" onClick={reset}>다시 시도</button>
      </div>
    </main>
  );
}
