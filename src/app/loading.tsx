export default function RootLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-3 px-4 py-16 text-center"
    >
      <div
        aria-hidden="true"
        className="h-9 w-9 animate-spin rounded-full border-3 border-[var(--border-subtle)] border-t-[var(--accent-primary)]"
      />
      <p className="text-sm font-medium text-[var(--text-secondary)]">
        Loading… • <span dir="rtl">جارٍ التحميل…</span>
      </p>
    </div>
  );
}
