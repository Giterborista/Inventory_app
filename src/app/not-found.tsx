export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="max-w-xl rounded-[2rem] border border-mist/80 bg-white px-8 py-10 text-center shadow-sm">
        <div className="section-title">Page not found</div>
        <h1 className="mt-4 text-3xl font-semibold text-ink">This page does not exist in the inventory builder.</h1>
        <p className="mt-3 text-sm leading-6 text-slate">
          Return to the main application entry point and reopen the JSON session you want to work on.
        </p>
      </div>
    </main>
  );
}
