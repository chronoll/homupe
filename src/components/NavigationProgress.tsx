"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import PageLoading from "./PageLoading";

function NavigationProgressInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);

  // 遷移完了 (URL 変更後の re-render) で消す
  useEffect(() => {
    setPending(false);
  }, [pathname, searchParams]);

  // <a> クリックを capture phase で拾って遷移開始を検知
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (e.button !== 0) return;

      const anchor = (e.target as HTMLElement | null)?.closest("a");
      if (!anchor || !anchor.href) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      try {
        const url = new URL(anchor.href);
        if (url.origin !== location.origin) return;
        if (
          url.pathname === location.pathname &&
          url.search === location.search
        ) {
          return;
        }
        setPending(true);
      } catch {
        // ignore
      }
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, []);

  return pending ? <PageLoading /> : null;
}

export default function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <NavigationProgressInner />
    </Suspense>
  );
}
