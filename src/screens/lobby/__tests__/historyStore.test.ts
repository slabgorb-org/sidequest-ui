import { describe, it, expect, beforeEach } from "vitest";
import {
  loadHistory,
  appendHistory,
  removeHistory,
  formatRelativeTime,
} from "@/screens/lobby/historyStore";

const STORAGE_KEY = "sidequest-history";

describe("journeyHistory", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("loadHistory", () => {
    it("returns empty array when nothing is stored", () => {
      expect(loadHistory()).toEqual([]);
    });

    it("returns empty array on corrupt JSON", () => {
      localStorage.setItem(STORAGE_KEY, "not-json{{{");
      expect(loadHistory()).toEqual([]);
    });

    it("returns empty array when stored value is not an array", () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ not: "array" }));
      expect(loadHistory()).toEqual([]);
    });

    it("filters out malformed entries", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([
          { player_name: "Keith", genre: "spaghetti_western", world: "dust", last_played_iso: "2026-04-13T00:00:00Z" },
          { player_name: "Marcus" }, // missing fields
          null,
          "string",
        ]),
      );
      const result = loadHistory();
      expect(result).toHaveLength(1);
      expect(result[0].player_name).toBe("Keith");
    });

    it("sorts entries newest first", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([
          { player_name: "A", genre: "g", world: "w", last_played_iso: "2026-04-10T00:00:00Z" },
          { player_name: "B", genre: "g", world: "w", last_played_iso: "2026-04-13T00:00:00Z" },
          { player_name: "C", genre: "g", world: "w", last_played_iso: "2026-04-12T00:00:00Z" },
        ]),
      );
      const result = loadHistory();
      expect(result.map((e) => e.player_name)).toEqual(["B", "C", "A"]);
    });
  });

  describe("appendHistory", () => {
    it("adds a new entry with a current timestamp", () => {
      appendHistory({ player_name: "Keith", genre: "tea_and_murder", world: "albion" });
      const result = loadHistory();
      expect(result).toHaveLength(1);
      expect(result[0].player_name).toBe("Keith");
      expect(result[0].last_played_iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("deduplicates by (player_name, genre, world) tuple", () => {
      appendHistory({ player_name: "Keith", genre: "tea_and_murder", world: "albion" });
      appendHistory({ player_name: "Keith", genre: "tea_and_murder", world: "albion" });
      appendHistory({ player_name: "Keith", genre: "tea_and_murder", world: "albion" });
      expect(loadHistory()).toHaveLength(1);
    });

    it("does NOT dedupe when player name differs", () => {
      appendHistory({ player_name: "Keith", genre: "tea_and_murder", world: "albion" });
      appendHistory({ player_name: "Sam", genre: "tea_and_murder", world: "albion" });
      expect(loadHistory()).toHaveLength(2);
    });

    it("caps the list at 5 entries (newest kept)", () => {
      for (let i = 0; i < 8; i++) {
        appendHistory({ player_name: `P${i}`, genre: "g", world: "w" });
      }
      const result = loadHistory();
      expect(result).toHaveLength(5);
      // Newest first — P7 was the last appended.
      expect(result[0].player_name).toBe("P7");
    });

    it("places the most recent entry at the front after dedup", () => {
      appendHistory({ player_name: "A", genre: "g", world: "w" });
      appendHistory({ player_name: "B", genre: "g", world: "w" });
      appendHistory({ player_name: "A", genre: "g", world: "w" }); // re-touch A
      const result = loadHistory();
      expect(result.map((e) => e.player_name)).toEqual(["A", "B"]);
    });
  });

  describe("removeHistory", () => {
    it("removes an entry by full tuple", () => {
      appendHistory({ player_name: "Keith", genre: "tea_and_murder", world: "albion" });
      appendHistory({ player_name: "Sam", genre: "tea_and_murder", world: "albion" });
      removeHistory({ player_name: "Keith", genre: "tea_and_murder", world: "albion" });
      const result = loadHistory();
      expect(result).toHaveLength(1);
      expect(result[0].player_name).toBe("Sam");
    });

    it("is a no-op when the entry is not present", () => {
      appendHistory({ player_name: "Keith", genre: "tea_and_murder", world: "albion" });
      removeHistory({ player_name: "Ghost", genre: "x", world: "y" });
      expect(loadHistory()).toHaveLength(1);
    });
  });

  describe("formatRelativeTime", () => {
    const NOW = new Date("2026-04-14T12:00:00Z");

    it("returns 'just now' for sub-minute intervals", () => {
      expect(formatRelativeTime("2026-04-14T11:59:30Z", NOW)).toBe("just now");
    });

    it("returns minutes for sub-hour intervals", () => {
      expect(formatRelativeTime("2026-04-14T11:55:00Z", NOW)).toBe("5 minutes ago");
      expect(formatRelativeTime("2026-04-14T11:59:00Z", NOW)).toBe("1 minute ago");
    });

    it("returns hours for sub-day intervals", () => {
      expect(formatRelativeTime("2026-04-14T09:00:00Z", NOW)).toBe("3 hours ago");
    });

    it("returns 'yesterday' for 1 day", () => {
      expect(formatRelativeTime("2026-04-13T12:00:00Z", NOW)).toBe("yesterday");
    });

    it("returns days for sub-week intervals", () => {
      expect(formatRelativeTime("2026-04-11T12:00:00Z", NOW)).toBe("3 days ago");
    });

    it("returns 'last week' for 7-13 days", () => {
      expect(formatRelativeTime("2026-04-06T12:00:00Z", NOW)).toBe("last week");
    });

    it("returns weeks for 14-29 days", () => {
      expect(formatRelativeTime("2026-03-25T12:00:00Z", NOW)).toBe("2 weeks ago");
    });

    it("returns months for 30-364 days", () => {
      expect(formatRelativeTime("2025-12-14T12:00:00Z", NOW)).toBe("4 months ago");
    });
  });
});
