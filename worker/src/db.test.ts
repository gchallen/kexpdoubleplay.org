import { describe, it, expect } from "bun:test";
import { rowToDoublePlay, type DoublePlayRow } from "./db";

describe("rowToDoublePlay", () => {
  it("should convert a full row to DoublePlay", () => {
    const row: DoublePlayRow = {
      id: 1,
      artist: "Pulp",
      title: "Spike Island",
      dj: "John Richards",
      show_name: "The Morning Show",
      classification: "legitimate",
      youtube_id: "abc123",
      first_play_timestamp: "2025-04-10T15:08:00Z",
      play_count: 2,
      plays_json: JSON.stringify([
        { timestamp: "2025-04-10T15:08:00Z", play_id: 3487084 },
        { timestamp: "2025-04-10T15:13:00Z", play_id: 3487086 },
      ]),
    };

    const dp = rowToDoublePlay(row);

    expect(dp.artist).toBe("Pulp");
    expect(dp.title).toBe("Spike Island");
    expect(dp.dj).toBe("John Richards");
    expect(dp.show).toBe("The Morning Show");
    expect(dp.classification).toBe("legitimate");
    expect(dp.youtube_id).toBe("abc123");
    expect(dp.plays).toHaveLength(2);
    expect(dp.plays[0].play_id).toBe(3487084);
  });

  it("should convert null fields to undefined", () => {
    const row: DoublePlayRow = {
      id: 2,
      artist: "Test",
      title: "Song",
      dj: null,
      show_name: null,
      classification: null,
      youtube_id: null,
      first_play_timestamp: "2025-04-10T10:00:00Z",
      play_count: 2,
      plays_json: JSON.stringify([
        { timestamp: "2025-04-10T10:00:00Z", play_id: 1 },
        { timestamp: "2025-04-10T10:04:00Z", play_id: 2 },
      ]),
    };

    const dp = rowToDoublePlay(row);

    expect(dp.dj).toBeUndefined();
    expect(dp.show).toBeUndefined();
    expect(dp.classification).toBeUndefined();
    expect(dp.youtube_id).toBeUndefined();
  });
});
