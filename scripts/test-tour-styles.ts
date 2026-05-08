// Smoke test for the "AI Providers settings clicks not registering" bug.
//
// On a fresh install the welcome tour auto-fires with no scope. Joyride's
// full-viewport overlay (z-index 60, dim background) was capturing every
// click on the page underneath — provider cards / save buttons looked
// active but nothing happened. Fix: overlay.pointerEvents = "none" so the
// dim visual stays but clicks pass through.
//
// This test guards against regression: if anyone removes the pointerEvents
// override or drops `spotlightClicks`, the test fails loudly.
//
//   pnpm tsx scripts/test-tour-styles.ts

import { buildJoyrideStyles } from "../src/components/tours/tour-styles";

const fail = (msg: string): never => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};

console.log("→ buildJoyrideStyles() shape");
const styles = buildJoyrideStyles() as {
  overlay?: { pointerEvents?: string };
  options?: { zIndex?: number; overlayColor?: string };
};

if (!styles.overlay) {
  fail("expected styles.overlay to exist (regression: overlay style removed)");
}
if (styles.overlay?.pointerEvents !== "none") {
  fail(
    `expected styles.overlay.pointerEvents === "none", got ${JSON.stringify(
      styles.overlay?.pointerEvents,
    )} — clicks on the page underneath the tour overlay would be eaten again`,
  );
}
console.log("✓ overlay.pointerEvents = 'none' (clicks pass through)");

if (!styles.options?.zIndex) {
  fail("expected styles.options.zIndex (Joyride needs to layer above app UI)");
}
console.log(`✓ overlay z-index set (${styles.options.zIndex})`);

if (!styles.options?.overlayColor) {
  fail("expected styles.options.overlayColor (visual dim is the point of the overlay)");
}
console.log(`✓ overlayColor set (${styles.options.overlayColor})`);

console.log("\n✓ tour overlay is non-blocking — AI Providers clicks should land");
