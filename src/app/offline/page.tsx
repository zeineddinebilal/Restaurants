import { WifiOff } from "lucide-react";
import { OfflineRetryButton } from "@/app/offline/OfflineRetryButton";
import { getI18nContext } from "@/lib/i18n/server";

export default async function OfflinePage() {
  const { dict } = await getI18nContext();

  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-5 px-4 py-20 text-center">
      <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-primary)]">
        <WifiOff className="h-8 w-8" aria-hidden="true" />
      </div>
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">{dict.offline.title}</h1>
      <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{dict.offline.body}</p>
      <OfflineRetryButton label={dict.offline.retry} />
    </div>
  );
}
