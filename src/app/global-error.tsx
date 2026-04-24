"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main className="flex min-h-screen items-center justify-center px-6 py-10">
          <div className="max-w-xl rounded-[2rem] border border-alert/20 bg-white px-8 py-10 text-center shadow-sm">
            <div className="section-title">Critical error</div>
            <h1 className="mt-4 text-3xl font-semibold text-ink">The proxy workspace could not be loaded.</h1>
            <p className="mt-3 text-sm leading-6 text-slate">
              {error.message || "A critical rendering error occurred."}
            </p>
            <button
              className="mt-6 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink"
              onClick={reset}
              type="button"
            >
              Reload
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
