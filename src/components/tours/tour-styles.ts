/**
 * Pure factory for the Joyride styles object. Lives outside `tour-runner.tsx`
 * so the regression test (`scripts/test-tour-styles.ts`) can import it without
 * pulling in the rest of the tour module graph (definitions.tsx uses JSX,
 * which doesn't compile in plain `tsx` script context).
 *
 * The bug this fixes: on a fresh install the welcome tour auto-fires with no
 * scope (intentional — it spotlights sidebar items that exist on every
 * surface), but Joyride's full-viewport overlay then captured every click on
 * the page beneath. Symptom: AI Providers settings page rendered but provider
 * cards / buttons were unresponsive. Fix: `overlay.pointerEvents = "none"`
 * keeps the visual dim but lets clicks fall through.
 */
export function buildJoyrideStyles(): Record<string, unknown> {
  return {
    options: {
      primaryColor: "var(--color-primary)",
      backgroundColor: "var(--color-card)",
      textColor: "var(--color-foreground)",
      arrowColor: "var(--color-card)",
      overlayColor: "rgba(0, 0, 0, 0.45)",
      zIndex: 60,
    },
    overlay: {
      pointerEvents: "none",
    },
    tooltip: {
      borderRadius: 10,
      padding: "16px 18px",
      fontFamily: "var(--font-sans, ui-sans-serif, system-ui, sans-serif)",
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
  };
}
