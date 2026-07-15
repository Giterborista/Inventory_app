import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="workspace-shell max-w-xl rounded-xl border border-mist bg-white px-8 py-10 text-center">
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-lg bg-accent text-xs font-bold tracking-wide text-white">LCI</span>
        <div className="section-title">Page not found</div>
        <h1 className="mt-4 text-3xl font-semibold text-ink">This page does not exist in the inventory builder.</h1>
        <p className="mt-3 text-sm leading-6 text-slate">
          Return to the main application entry point and reopen the JSON session you want to work on.
        </p>
        <Link className="mt-6 inline-flex rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1f4b87]" href="/">
          Return to LCI Builder
        </Link>
      </div>
    </main>
  );
}
