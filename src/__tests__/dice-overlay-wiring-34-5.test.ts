/**
 * Story 34-5: Production wiring tests for dice overlay.
 *
 * Verifies that DiceOverlay is actually integrated into the production
 * code path — not just implemented in isolation. Source-reading tests
 * check App.tsx and message dispatch, following the pattern established
 * in confrontation-wiring.test.tsx.
 *
 * RED phase — all tests FAIL until Dev wires the overlay into App.tsx.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SRC_ROOT = path.resolve(__dirname, "..");

function readSrc(relativePath: string): string {
  return fs.readFileSync(path.resolve(SRC_ROOT, relativePath), "utf-8");
}

// ═══��══════════════════════════════════════════════════════════════════════════
// Wiring: App.tsx lazy-loads DiceOverlay
// ══════════════════════════════��═══════════════════════════════════════════════

describe("Wiring: dice rendering reaches the production tree", () => {
  // The 34-5 spike rendered dice via a lazy-loaded full-screen DiceOverlay
  // hung directly off App.tsx. That overlay was retired (see App.tsx header
  // comment near line 40): production dice now render inline inside the
  // Confrontation panel via InlineDiceTray, reached through
  // GameBoard → ConfrontationWidget → ConfrontationOverlay → InlineDiceTray.
  // The wiring contract is therefore "App passes dice props to GameBoard, and
  // ConfrontationOverlay imports InlineDiceTray".

  it("App.tsx passes diceRequest and diceResult through to GameBoard", () => {
    const appSrc = readSrc("App.tsx");
    expect(appSrc).toMatch(/diceRequest=\{diceRequest\}/);
    expect(appSrc).toMatch(/diceResult=\{diceResult\}/);
  });

  it("ConfrontationOverlay imports InlineDiceTray as the production dice host", () => {
    const overlaySrc = readSrc("components/ConfrontationOverlay.tsx");
    expect(overlaySrc).toMatch(/import\s*\{\s*InlineDiceTray\s*\}\s*from\s*['"]@\/dice\/InlineDiceTray['"]/);
    expect(overlaySrc).toMatch(/<InlineDiceTray/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Wiring: DICE_REQUEST triggers overlay display
// ════════════════════════════════════════════════════���═════════════════════════

describe("Wiring: DICE_REQUEST message handling in App.tsx", () => {
  it("App.tsx handles MessageType.DICE_REQUEST in message dispatch", () => {
    const appSrc = readSrc("App.tsx");
    // Must dispatch on DICE_REQUEST to show the overlay
    expect(appSrc).toMatch(/DICE_REQUEST/);
  });

  it("App.tsx handles MessageType.DICE_RESULT in message dispatch", () => {
    const appSrc = readSrc("App.tsx");
    // Must dispatch on DICE_RESULT to show the resolved roll
    expect(appSrc).toMatch(/DICE_RESULT/);
  });

  it("App.tsx maintains dice request state", () => {
    const appSrc = readSrc("App.tsx");
    // Must have state for the active dice request
    expect(appSrc).toMatch(/useState.*dice|diceRequest/i);
  });

  it("App.tsx passes diceRequest and diceResult to DiceOverlay", () => {
    const appSrc = readSrc("App.tsx");
    // The rendered DiceOverlay must receive both props
    expect(appSrc).toMatch(/diceRequest=\{/);
    expect(appSrc).toMatch(/diceResult=\{/);
  });
});

// ════════════════════════════════════════════���═════════════════════════════════
// Wiring: DICE_THROW sends message to server
// ══════════════════════════════════════════════════════��═══════════════════════

describe("Wiring: DICE_THROW message sending", () => {
  it("App.tsx has a handleDiceThrow callback that sends DICE_THROW", () => {
    const appSrc = readSrc("App.tsx");
    // Must have a handler that sends the throw gesture to the server
    expect(appSrc).toMatch(/handleDiceThrow|onDiceThrow|onThrow/);
    expect(appSrc).toMatch(/DICE_THROW/);
  });

  it("App.tsx passes the throw handler down through GameBoard", () => {
    // Post-DiceOverlay, the throw callback flows App → GameBoard
    // (onDiceThrow) → ConfrontationWidget → ConfrontationOverlay →
    // InlineDiceTray (onThrow). The App-level wire is `onDiceThrow`.
    const appSrc = readSrc("App.tsx");
    expect(appSrc).toMatch(/onDiceThrow=\{handleDiceThrow\}/);
  });

  it("handleDiceThrow sends message via WebSocket send()", () => {
    const appSrc = readSrc("App.tsx");
    // The handler must call send() with a DICE_THROW message
    expect(appSrc).toMatch(/type:\s*MessageType\.DICE_THROW/);
  });
});

// ════════════════════════════════════════��═════════════════════════════════════
// Wiring: Protocol types are registered
// ══════════════════════════════════════════════════════════════════════════════

describe("Wiring: Protocol types exist in type system", () => {
  // Accept both the legacy enum form (`KEY = "VAL"`) and the current
  // const-object form (`KEY: "VAL"`). protocol.ts was converted to a
  // const object with `erasableSyntaxOnly` on the tsconfig.
  it("MessageType in protocol.ts includes DICE_REQUEST", () => {
    const protocolSrc = readSrc("types/protocol.ts");
    expect(protocolSrc).toMatch(/DICE_REQUEST\s*[:=]\s*["']DICE_REQUEST["']/);
  });

  it("MessageType in protocol.ts includes DICE_THROW", () => {
    const protocolSrc = readSrc("types/protocol.ts");
    expect(protocolSrc).toMatch(/DICE_THROW\s*[:=]\s*["']DICE_THROW["']/);
  });

  it("MessageType in protocol.ts includes DICE_RESULT", () => {
    const protocolSrc = readSrc("types/protocol.ts");
    expect(protocolSrc).toMatch(/DICE_RESULT\s*[:=]\s*["']DICE_RESULT["']/);
  });

  it("payloads.ts exports DiceRequestPayload interface", () => {
    const payloadsSrc = readSrc("types/payloads.ts");
    expect(payloadsSrc).toMatch(/export\s+interface\s+DiceRequestPayload/);
  });

  it("payloads.ts exports DiceResultPayload interface", () => {
    const payloadsSrc = readSrc("types/payloads.ts");
    expect(payloadsSrc).toMatch(/export\s+interface\s+DiceResultPayload/);
  });

  it("payloads.ts exports DiceThrowPayload interface", () => {
    const payloadsSrc = readSrc("types/payloads.ts");
    expect(payloadsSrc).toMatch(/export\s+interface\s+DiceThrowPayload/);
  });

  it("TypedGameMessage union includes DiceRequestMessage", () => {
    const payloadsSrc = readSrc("types/payloads.ts");
    expect(payloadsSrc).toMatch(/DiceRequestMessage/);
  });

  it("TypedGameMessage union includes DiceResultMessage", () => {
    const payloadsSrc = readSrc("types/payloads.ts");
    expect(payloadsSrc).toMatch(/DiceResultMessage/);
  });
});

// ═══════════════════════���══════════════════════════════════════════════════════
// Wiring: DiceOverlay accepts production props interface
// ═══════════════════════════════════════════════════��══════════════════════════

describe("Wiring: DiceOverlay production props", () => {
  it("DiceOverlay accepts diceRequest prop (nullable)", () => {
    const overlaySrc = readSrc("dice/DiceOverlay.tsx");
    expect(overlaySrc).toMatch(/diceRequest/);
  });

  it("DiceOverlay accepts diceResult prop (nullable)", () => {
    const overlaySrc = readSrc("dice/DiceOverlay.tsx");
    expect(overlaySrc).toMatch(/diceResult/);
  });

  it("DiceOverlay accepts playerId prop", () => {
    const overlaySrc = readSrc("dice/DiceOverlay.tsx");
    expect(overlaySrc).toMatch(/playerId/);
  });

  it("DiceOverlay accepts onThrow callback prop", () => {
    const overlaySrc = readSrc("dice/DiceOverlay.tsx");
    expect(overlaySrc).toMatch(/onThrow/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Wiring: Player ID passed to overlay for role determination
// ══════════════════════════════════════════════════════════════════════════════

describe("Wiring: Player ID flows through for role determination", () => {
  it("App.tsx passes the local player id down to GameBoard", () => {
    // currentPlayerId is the App-level identity that GameBoard hands to
    // ConfrontationOverlay → InlineDiceTray for rolling-vs-spectator gating.
    const appSrc = readSrc("App.tsx");
    expect(appSrc).toMatch(/currentPlayerId=\{currentPlayerId/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Wiring: Physics-is-the-roll (story 34-12)
// ──────────────────────────────────────────────────────────────────────────────
// These assertions exist because the original implementation stubbed
// handleSettle as a no-op, left readD20Value with no production consumer,
// and shipped a DiceThrowPayload wire format with no face field. The composed
// system couldn't carry a rolled face from physics back to the server, but
// every individual story's internal wiring check passed. These regression
// guards look at the composed end-to-end path.
// ══════════════════════════════════════════════════════════════════════════════

describe("Wiring: Physics-is-the-roll (story 34-12)", () => {
  it("DiceOverlay.handleSettle is NOT a no-op stub", () => {
    const overlaySrc = readSrc("dice/DiceOverlay.tsx");
    // handleSettle must actually do something with the settled face.
    // The stub form was a useCallback body of only `// Settle is now
    // driven by DiceResult from server, not local physics`.
    const idx = overlaySrc.indexOf("const handleSettle");
    expect(idx).toBeGreaterThanOrEqual(0);
    // Take the 1500-char window starting at handleSettle — enough to cover
    // the callback body and deps array without being so large it collides
    // with other callbacks defined below.
    const body = overlaySrc.slice(idx, idx + 1500);
    // Must call onThrow (the wire-sending callback) — the old stub did not.
    expect(body).toMatch(/onThrow\s*\(/);
    // Must accept the settled face as a parameter. Old stub was `()`.
    expect(body).toMatch(/handleSettle\s*=\s*useCallback\(\s*\(\s*\w+\s*:\s*number\s*\)/);
  });

  // (Dropped: "readD20Value has a production consumer via onSettle" —
  // that assertion read dice-lib's DiceScene internals, which is dice-lib's
  // own test territory now that it's a separate library. The sidequest-ui
  // contract is "DiceOverlay's onThrow receives face[]" — covered by the
  // physics-is-the-roll assertions below.)

  it("DiceThrowPayload wire type includes a face field", () => {
    const payloadsSrc = readSrc("types/payloads.ts");
    // Locate the DiceThrowPayload interface body and require `face` in it.
    const iface = payloadsSrc.match(
      /export\s+interface\s+DiceThrowPayload\s*\{[\s\S]*?\}/,
    );
    expect(iface).not.toBeNull();
    expect(iface![0]).toMatch(/face\s*:\s*number\[\]/);
  });

  it("App.tsx.handleDiceThrow forwards face to the wire DICE_THROW message", () => {
    const appSrc = readSrc("App.tsx");
    // The handler signature must accept face and the sent payload must
    // include it. Beat dispatch (story 34-12 + later) added a beat_id
    // spread after `face`, so we no longer require face to be the last
    // payload field — only that it appears inside the handler's body.
    expect(appSrc).toMatch(/handleDiceThrow\s*=\s*useCallback\s*\(\s*\(\s*params[^,)]*,\s*face/);
    const handlerMatch = appSrc.match(
      /handleDiceThrow\s*=\s*useCallback\([\s\S]*?\],\s*\)/,
    );
    expect(handlerMatch).not.toBeNull();
    // face must be a key in the DICE_THROW payload — accepts trailing
    // comma + spread or a closing brace.
    expect(handlerMatch![0]).toMatch(/face[,\s]/);
  });

  it("DiceOverlay.onThrow callback signature accepts face", () => {
    const overlaySrc = readSrc("dice/DiceOverlay.tsx");
    // The props type must declare onThrow as taking both params and face.
    expect(overlaySrc).toMatch(
      /onThrow\s*:\s*\(\s*params\s*:[^,]+,\s*face\s*:\s*number\[\]\s*\)\s*=>\s*void/,
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Wiring: NARRATION_END clears the stale dice TARGET + result widget
// ──────────────────────────────────────────────────────────────────────────────
// Playtest-pingpong 2026-04-24: after a roll resolves, the TARGET banner and
// "Rolled N vs M — Fail" readout stayed on screen through the narrator's
// next turn. Players read the stale numbers as the DC for the next click.
// The fix: on NARRATION_END (the narrator's turn boundary, which also
// re-enables input), clear diceRequest + diceResult so the widgets return
// to a neutral state until the next beat issues a fresh DICE_REQUEST.
// ══════════════════════════════════════════════════════════════════════════════

describe("Wiring: NARRATION_END clears dice TARGET + result widget", () => {
  it("App.tsx clears diceRequest and diceResult inside the NARRATION_END branch", () => {
    const appSrc = readSrc("App.tsx");
    // Locate the NARRATION_END branch — the same block that toggles
    // setCanType(true) and clears confrontation on turn boundary.
    const narrationEndIdx = appSrc.indexOf(
      "if (msg.type === MessageType.NARRATION_END) {",
    );
    expect(narrationEndIdx).toBeGreaterThanOrEqual(0);
    // Take a bounded window covering the branch body.
    const body = appSrc.slice(narrationEndIdx, narrationEndIdx + 2000);
    // Both dice state setters must be invoked with null inside this block.
    // Without these, the previous roll's TARGET + result badge persists
    // until the next DICE_REQUEST arrives.
    expect(body).toMatch(/setDiceRequest\(\s*null\s*\)/);
    expect(body).toMatch(/setDiceResult\(\s*null\s*\)/);
  });

  it("App.tsx still passes the cleared dice state through to the overlay", () => {
    // Regression guard: if someone later moves the setters out of the
    // NARRATION_END block, the overlay props wiring still reads from
    // the same state. Keep the wiring surface pinned so the clear
    // actually reaches the UI.
    const appSrc = readSrc("App.tsx");
    expect(appSrc).toMatch(/diceRequest=\{diceRequest\}/);
    expect(appSrc).toMatch(/diceResult=\{diceResult\}/);
  });
});
