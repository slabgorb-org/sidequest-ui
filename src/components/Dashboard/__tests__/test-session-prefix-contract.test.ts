import { describe, expect, it } from "vitest";

import contract from "./fixtures/test_session_prefix_contract.json";
import { TEST_SESSION_SLUG_PREFIXES, isTestSession } from "../source/useLiveSource";

// Story 125-10 (follow-up to 126-34) — UI half of the cross-repo test-session
// prefix contract. The canonical prefix set + golden classification cases live in
// a fixture VENDORED BYTE-IDENTICAL in both repos. Server counterpart:
//   sidequest-server/tests/server/test_test_session_prefix_contract.py
//
// The lock: this test pins the production predicate's DECLARED prefix array
// (TEST_SESSION_SLUG_PREFIXES) to the canonical fixture, so adding a prefix to
// isTestSession (or the ui array) without updating the fixture fails CI here —
// forcing every prefix change through the single canonical declaration that the
// server side is pinned to as well.

describe("test-session prefix contract (story 125-10)", () => {
  it("declares exactly the canonical prefix set", () => {
    expect([...TEST_SESSION_SLUG_PREFIXES]).toEqual(contract.prefixes);
  });

  it("classifies every canonical golden case the server predicate also runs", () => {
    for (const c of contract.cases) {
      expect(isTestSession(c.slug)).toBe(c.is_test);
    }
  });
});
