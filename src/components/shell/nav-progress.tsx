"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

/**
 * Thin top progress bar that briefly animates on every route change.
 * Pairs with the (app)/loading.tsx skeleton for slow server renders —
 * this gives instant visual feedback on fast client navigations too.
 */
export function NavProgress() {
  const pathname = usePathname();
  const [active, setActive] = React.useState(false);
  const [width, setWidth] = React.useState(0);
  const isFirstRender = React.useRef(true);
  const timersRef = React.useRef<{
    rise?: ReturnType<typeof setTimeout>;
    complete?: ReturnType<typeof setTimeout>;
    hide?: ReturnType<typeof setTimeout>;
  }>({});

  React.useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    Object.values(timersRef.current).forEach((t) => t && clearTimeout(t));

    setActive(true);
    setWidth(15);
    timersRef.current.rise = setTimeout(() => setWidth(75), 80);
    timersRef.current.complete = setTimeout(() => setWidth(100), 280);
    timersRef.current.hide = setTimeout(() => {
      setActive(false);
      setWidth(0);
    }, 500);

    return () => {
      Object.values(timersRef.current).forEach((t) => t && clearTimeout(t));
    };
  }, [pathname]);

  return (
    <div
      className="pointer-events-none fixed left-0 right-0 top-0 z-[60] h-0.5"
      aria-hidden
    >
      <div
        className="h-full bg-[var(--color-primary)] shadow-[0_0_8px_var(--color-primary)] transition-[width,opacity] duration-200 ease-out"
        style={{
          width: `${width}%`,
          opacity: active ? 1 : 0,
        }}
      />
    </div>
  );
}
