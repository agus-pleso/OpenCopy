"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { toast } from "sonner";

import type { ToursCompleted } from "@/db/schema";
import { TOUR_BY_ID } from "@/lib/tours/definitions";
import { markTourCompleted, type TourId } from "@/server/actions/tours";

// react-joyride pulls in DOM APIs eagerly — load it only on the client.
// v3 ships a named `Joyride` export, no default. Cast to the loose
// JoyrideProps shape so we don't fight the library's heavy generic types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Joyride: React.ComponentType<JoyrideProps> = dynamic<any>(
  async () => (await import("react-joyride")).Joyride,
  { ssr: false },
);

interface JoyrideProps {
  steps: unknown[];
  run?: boolean;
  continuous?: boolean;
  showSkipButton?: boolean;
  showProgress?: boolean;
  disableScrolling?: boolean;
  hideCloseButton?: boolean;
  locale?: Record<string, string>;
  styles?: Record<string, unknown>;
  callback?: (data: { status?: string; action?: string }) => void;
}

interface TourContext {
  /** Start (or restart) a tour. Passing the first-run id replays the
   *  full welcome walkthrough; per-surface ids fire scoped tours. */
  startTour: (id: TourId) => void;
  /** Mark every tour as not-completed so they all auto-fire again. */
  resetAll: () => void;
  /** Tours the current user has finished (read-only mirror of the server). */
  completed: ToursCompleted;
}

const Ctx = React.createContext<TourContext | null>(null);

export function useTours(): TourContext {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useTours must be used inside <TourRunner>");
  return ctx;
}

interface Props {
  initialCompleted: ToursCompleted;
  children: React.ReactNode;
}

export function TourRunner({ initialCompleted, children }: Props) {
  const pathname = usePathname();
  const [completed, setCompleted] =
    React.useState<ToursCompleted>(initialCompleted);
  const [activeTourId, setActiveTourId] = React.useState<TourId | null>(null);

  // Auto-fire the welcome tour exactly once per user.
  React.useEffect(() => {
    if (!completed.first_run && activeTourId === null) {
      // Slight delay so the layout finishes painting before the spotlight
      // appears — react-joyride positions against rendered DOM.
      const t = setTimeout(() => setActiveTourId("first_run"), 600);
      return () => clearTimeout(t);
    }
  }, [completed.first_run, activeTourId]);

  const startTour = React.useCallback((id: TourId) => {
    setActiveTourId(id);
  }, []);

  const finish = React.useCallback(
    async (id: TourId) => {
      setActiveTourId(null);
      setCompleted((prev) => ({ ...prev, [id]: true }));
      try {
        await markTourCompleted(id, true);
      } catch {
        // non-fatal — toast a hint and the tour will simply re-fire
        toast.error("Could not save tour state — it may replay next time.");
      }
    },
    [],
  );

  const resetAll = React.useCallback(() => {
    setCompleted({});
    void markTourCompleted("first_run", false).catch(() => {});
  }, []);

  const tour = activeTourId ? TOUR_BY_ID[activeTourId] : null;

  // If this tour has a scope and the user isn't on a matching path, do
  // nothing — surface tours only run on their surface.
  const inScope =
    !tour ||
    !tour.scope ||
    pathname === tour.scope ||
    pathname.startsWith(`${tour.scope}/`);

  return (
    <Ctx.Provider value={{ startTour, resetAll, completed }}>
      {children}
      {tour && inScope && (
        <Joyride
          steps={tour.steps}
          run
          continuous
          showSkipButton
          showProgress
          disableScrolling={false}
          hideCloseButton={false}
          locale={{
            back: "Back",
            close: "Close",
            last: "Done",
            next: "Next",
            skip: "Skip tour",
          }}
          styles={{
            options: {
              primaryColor: "var(--color-primary)",
              backgroundColor: "var(--color-card)",
              textColor: "var(--color-foreground)",
              arrowColor: "var(--color-card)",
              overlayColor: "rgba(0, 0, 0, 0.45)",
              zIndex: 60,
            },
            tooltip: {
              borderRadius: 10,
              padding: "16px 18px",
              fontFamily:
                "var(--font-sans, ui-sans-serif, system-ui, sans-serif)",
            },
            tooltipContainer: { textAlign: "left" },
            buttonNext: {
              borderRadius: 6,
              padding: "6px 12px",
              fontSize: 13,
              fontWeight: 500,
            },
            buttonBack: {
              color: "var(--color-muted-foreground)",
              fontSize: 13,
            },
            buttonSkip: {
              color: "var(--color-muted-foreground)",
              fontSize: 13,
            },
          }}
          callback={(data: { status?: string; action?: string }) => {
            // Joyride's `status` strings; finished/skipped both close.
            if (
              data.status === "finished" ||
              data.status === "skipped" ||
              data.action === "close"
            ) {
              void finish(tour.id);
            }
          }}
        />
      )}
    </Ctx.Provider>
  );
}
