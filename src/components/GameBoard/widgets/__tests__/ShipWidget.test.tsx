/**
 * ShipWidget — fetches the chassis interior SVG once on mount and
 * renders it via dangerouslySetInnerHTML. Live PC overlay is deferred
 * (see spec §"Out of scope" + Phase 2 plan).
 */

import { render, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ShipWidget } from "../ShipWidget";

const KESTREL_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg">' +
  '<g data-room="cockpit"><g data-station="helm"></g></g>' +
  '<g data-room="engineering"></g>' +
  "</svg>";

describe("ShipWidget", () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(KESTREL_SVG),
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches /api/chassis/{id}/interior on mount", async () => {
    render(<ShipWidget chassisInstanceId="kestrel" />);
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/chassis/kestrel/interior",
      );
    });
  });

  it("renders the returned SVG", async () => {
    const { container } = render(<ShipWidget chassisInstanceId="kestrel" />);
    await waitFor(() => {
      expect(container.querySelector('[data-room="cockpit"]')).not.toBeNull();
    });
    expect(container.querySelector('[data-station="helm"]')).not.toBeNull();
    expect(container.querySelector('[data-room="engineering"]')).not.toBeNull();
  });

  it("renders a loading placeholder before the SVG arrives", () => {
    // Block fetch so the SVG never resolves during this assertion.
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    const { getByText } = render(<ShipWidget chassisInstanceId="kestrel" />);
    expect(getByText(/loading ship interior/i)).toBeTruthy();
  });
});
