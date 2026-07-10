"use client";

import dynamic from "next/dynamic";

const HeaderSearch = dynamic(
  () =>
    import("@/components/search/header-search").then((m) => m.HeaderSearch),
  {
    ssr: false,
    loading: () => <div className="w-9 h-9" aria-hidden />,
  }
);

const LocalePicker = dynamic(
  () => import("@/components/locale-picker").then((m) => m.LocalePicker),
  {
    ssr: false,
    loading: () => <div className="w-9 h-9" aria-hidden />,
  }
);

export function DeferredHeaderSearch() {
  return <HeaderSearch />;
}

export function DeferredLocalePicker() {
  return <LocalePicker />;
}
