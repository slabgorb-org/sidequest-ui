import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useBugReport } from "../useBugReport";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("useBugReport", () => {
  it("posts multipart to /api/bug-report and exposes the issue url", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ issue_url: "https://github.com/o/r/issues/5", issue_number: 5, report_id: "abc" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useBugReport());
    await act(async () => {
      await result.current.submit({
        title: "T",
        description: "D",
        files: [new File([new Uint8Array([1, 2])], "shot.png", { type: "image/png" })],
        context: { sessionSlug: "s1", genre: "space_opera", screen: "game" },
      });
    });

    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(result.current.issueUrl).toBe("https://github.com/o/r/issues/5");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/bug-report");
    expect(init.method).toBe("POST");
    const fd = init.body as FormData;
    expect(fd.get("title")).toBe("T");
    expect(fd.get("session_slug")).toBe("s1");
    expect(fd.getAll("files").length).toBe(1);
    expect(JSON.parse(fd.get("context_json") as string).genre).toBe("space_opera");
  });

  it("surfaces an error when the server responds non-ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 502, text: async () => "bad" }));
    const { result } = renderHook(() => useBugReport());
    await act(async () => {
      await result.current.submit({ title: "T", description: "D", files: [], context: {} });
    });
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toContain("502");
  });
});
