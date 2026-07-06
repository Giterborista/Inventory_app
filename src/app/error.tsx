"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="max-w-xl rounded-[2rem] border border-alert/20 bg-white px-8 py-10 text-center shadow-sm">
        <div className="section-title">Application error</div>
        <h1 className="mt-4 text-3xl font-semibold text-ink">The inventory builder hit an unexpected problem.</h1>
        <p className="mt-3 text-sm leading-6 text-slate">
          {error.message || "An unknown error occurred while rendering the application."}
        </p>
        <button
          className="mt-6 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink"
          onClick={reset}
          type="button"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
