import { describe, it, expect } from "bun:test";
import { detectDoublePlays, mergeDoublePlays, classify } from "./detector";
import type { KEXPPlay, DoublePlay } from "@kexp-doubleplay/types";

function play(overrides: Partial<KEXPPlay> & { airdate: string; play_id: number }): KEXPPlay {
  return {
    artist: "Test Artist",
    song: "Test Song",
    play_type: "trackplay",
    ...overrides,
  } as KEXPPlay;
}

describe("detectDoublePlays", () => {
  it("should detect a simple double play", async () => {
    const plays: KEXPPlay[] = [
      play({ airdate: "2025-04-10T15:08:00Z", play_id: 1, artist: "Test Artist", song: "Test Song", host: { id: 1, name: "DJ Test" }, show: { id: 1, name: "Morning Show" } }),
      play({ airdate: "2025-04-10T15:12:00Z", play_id: 2, artist: "Test Artist", song: "Test Song", host: { id: 1, name: "DJ Test" }, show: { id: 1, name: "Morning Show" } }),
    ];

    const result = await detectDoublePlays(plays);

    expect(result).toHaveLength(1);
    expect(result[0].artist).toBe("Test Artist");
    expect(result[0].title).toBe("Test Song");
    expect(result[0].plays).toHaveLength(2);
    expect(result[0].dj).toBe("DJ Test");
    expect(result[0].show).toBe("Morning Show");
  });

  it("should detect double play with air break in between", async () => {
    const plays: KEXPPlay[] = [
      play({ airdate: "2025-04-10T10:08:00Z", play_id: 1 }),
      { airdate: "2025-04-10T10:10:00Z", artist: "", song: "", play_id: 2, play_type: "airbreak" } as KEXPPlay,
      play({ airdate: "2025-04-10T10:12:00Z", play_id: 3 }),
    ];

    const result = await detectDoublePlays(plays);

    expect(result).toHaveLength(1);
    expect(result[0].plays).toHaveLength(2);
    expect(result[0].plays[0].play_id).toBe(1);
    expect(result[0].plays[1].play_id).toBe(3);
  });

  it("should detect triple play", async () => {
    const plays: KEXPPlay[] = [
      play({ airdate: "2025-04-10T10:00:00Z", play_id: 1, artist: "Band", song: "Hit" }),
      play({ airdate: "2025-04-10T10:04:00Z", play_id: 2, artist: "Band", song: "Hit" }),
      play({ airdate: "2025-04-10T10:08:00Z", play_id: 3, artist: "Band", song: "Hit" }),
    ];

    const result = await detectDoublePlays(plays);

    expect(result).toHaveLength(1);
    expect(result[0].plays).toHaveLength(3);
  });

  it("should not detect double play when different songs", async () => {
    const plays: KEXPPlay[] = [
      play({ airdate: "2025-04-10T10:00:00Z", play_id: 1, artist: "Band", song: "Song 1" }),
      play({ airdate: "2025-04-10T10:04:00Z", play_id: 2, artist: "Band", song: "Song 2" }),
    ];

    const result = await detectDoublePlays(plays);

    expect(result).toHaveLength(0);
  });

  it("should handle case-insensitive matching", async () => {
    const plays: KEXPPlay[] = [
      play({ airdate: "2025-04-10T10:00:00Z", play_id: 1, artist: "The Band", song: "Great Song" }),
      play({ airdate: "2025-04-10T10:04:00Z", play_id: 2, artist: "THE BAND", song: "GREAT SONG" }),
    ];

    const result = await detectDoublePlays(plays);

    expect(result).toHaveLength(1);
    expect(result[0].plays).toHaveLength(2);
  });

  it("should not detect double play when different artists", async () => {
    const plays: KEXPPlay[] = [
      play({ airdate: "2025-04-10T10:00:00Z", play_id: 1, artist: "Band A", song: "Song" }),
      play({ airdate: "2025-04-10T10:04:00Z", play_id: 2, artist: "Band B", song: "Song" }),
    ];

    const result = await detectDoublePlays(plays);

    expect(result).toHaveLength(0);
  });

  it("should skip non-trackplay entries", async () => {
    const plays: KEXPPlay[] = [
      play({ airdate: "2025-04-10T10:00:00Z", play_id: 1 }),
      { airdate: "2025-04-10T10:03:00Z", artist: "", song: "", play_id: 2, play_type: "airbreak" } as KEXPPlay,
      play({ airdate: "2025-04-10T10:04:00Z", play_id: 3, artist: "Other", song: "Other Song" }),
    ];

    const result = await detectDoublePlays(plays);

    expect(result).toHaveLength(0);
  });

  it("should filter plays with backwards timestamps (sorted by ID)", async () => {
    // Play ID 2 has an earlier timestamp than play ID 1 — should be filtered out
    const plays: KEXPPlay[] = [
      play({ airdate: "2025-04-10T10:04:00Z", play_id: 1, artist: "Band", song: "Song A" }),
      play({ airdate: "2025-04-10T10:00:00Z", play_id: 2, artist: "Band", song: "Song A" }), // backwards
      play({ airdate: "2025-04-10T10:08:00Z", play_id: 3, artist: "Band", song: "Song A" }),
    ];

    const result = await detectDoublePlays(plays);

    // After filtering play_id 2 (backwards), only plays 1 and 3 remain
    // They are the same song so should be detected
    expect(result).toHaveLength(1);
    expect(result[0].plays).toHaveLength(2);
    expect(result[0].plays[0].play_id).toBe(1);
    expect(result[0].plays[1].play_id).toBe(3);
  });

  it("should handle empty play list", async () => {
    const result = await detectDoublePlays([]);
    expect(result).toHaveLength(0);
  });

  it("should handle single play", async () => {
    const result = await detectDoublePlays([
      play({ airdate: "2025-04-10T10:00:00Z", play_id: 1 }),
    ]);
    expect(result).toHaveLength(0);
  });

  it("should detect World News double play with airbreak (real KEXP data)", async () => {
    const plays: KEXPPlay[] = [
      play({ airdate: "2025-09-23T07:26:19-07:00", artist: "World News", song: "Everything is Coming Up Roses", album: "Everything is Coming Up Roses", play_id: 3556644 }),
      { airdate: "2025-09-23T07:29:55-07:00", artist: "", song: "", play_id: 3556645, play_type: "airbreak" } as KEXPPlay,
      play({ airdate: "2025-09-23T07:31:05-07:00", artist: "World News", song: "Everything is Coming Up Roses", album: "Everything is Coming Up Roses", play_id: 3556646 }),
    ];

    const result = await detectDoublePlays(plays);

    expect(result).toHaveLength(1);
    expect(result[0].artist).toBe("World News");
    expect(result[0].title).toBe("Everything is Coming Up Roses");
    expect(result[0].plays).toHaveLength(2);
    expect(result[0].plays[0].play_id).toBe(3556644);
    expect(result[0].plays[1].play_id).toBe(3556646);
  });

  it("should detect double play with missing album info", async () => {
    const plays: KEXPPlay[] = [
      play({ airdate: "2025-09-23T07:26:19-07:00", artist: "World News", song: "Everything is Coming Up Roses", album: undefined, play_id: 3556644 }),
      { airdate: "2025-09-23T07:29:55-07:00", artist: "", song: "", play_id: 3556645, play_type: "airbreak" } as KEXPPlay,
      play({ airdate: "2025-09-23T07:31:05-07:00", artist: "World News", song: "Everything is Coming Up Roses", album: undefined, play_id: 3556646 }),
    ];

    const result = await detectDoublePlays(plays);

    expect(result).toHaveLength(1);
    expect(result[0].plays).toHaveLength(2);
  });

  it("should calculate play durations from timestamps", async () => {
    const plays: KEXPPlay[] = [
      play({ airdate: "2025-04-10T10:00:00Z", play_id: 1 }),
      play({ airdate: "2025-04-10T10:05:00Z", play_id: 2 }),
      play({ airdate: "2025-04-10T10:10:00Z", play_id: 3, artist: "Other", song: "Other" }),
    ];

    const result = await detectDoublePlays(plays);

    expect(result).toHaveLength(1);
    expect(result[0].plays[0].duration).toBe(300); // 5 minutes
    expect(result[0].plays[1].duration).toBe(300); // 5 minutes to next track
  });
});

describe("mergeDoublePlays", () => {
  it("should merge overlapping double plays", () => {
    const existing: DoublePlay[] = [
      {
        artist: "Band", title: "Song",
        plays: [
          { timestamp: "2025-04-10T10:00:00Z", play_id: 1, kexpPlay: {} as KEXPPlay },
          { timestamp: "2025-04-10T10:04:00Z", play_id: 2, kexpPlay: {} as KEXPPlay },
        ],
      },
    ];

    const incoming: DoublePlay[] = [
      {
        artist: "Band", title: "Song",
        plays: [
          { timestamp: "2025-04-10T10:04:00Z", play_id: 2, kexpPlay: {} as KEXPPlay },
          { timestamp: "2025-04-10T10:08:00Z", play_id: 3, kexpPlay: {} as KEXPPlay },
        ],
      },
    ];

    const merged = mergeDoublePlays(existing, incoming);

    expect(merged).toHaveLength(1);
    expect(merged[0].plays).toHaveLength(3);
    expect(merged[0].plays.map((p) => p.play_id)).toEqual([1, 2, 3]);
  });

  it("should not merge non-overlapping double plays", () => {
    const existing: DoublePlay[] = [
      {
        artist: "Band", title: "Song",
        plays: [
          { timestamp: "2025-04-10T10:00:00Z", play_id: 1, kexpPlay: {} as KEXPPlay },
          { timestamp: "2025-04-10T10:04:00Z", play_id: 2, kexpPlay: {} as KEXPPlay },
        ],
      },
    ];

    const incoming: DoublePlay[] = [
      {
        artist: "Band", title: "Song",
        plays: [
          { timestamp: "2025-04-11T10:00:00Z", play_id: 3, kexpPlay: {} as KEXPPlay },
          { timestamp: "2025-04-11T10:04:00Z", play_id: 4, kexpPlay: {} as KEXPPlay },
        ],
      },
    ];

    const merged = mergeDoublePlays(existing, incoming);

    expect(merged).toHaveLength(2);
  });

  it("should add DJ and show info when missing", () => {
    const existing: DoublePlay[] = [
      {
        artist: "Band", title: "Song",
        plays: [
          { timestamp: "2025-04-10T10:00:00Z", play_id: 1, kexpPlay: {} as KEXPPlay },
          { timestamp: "2025-04-10T10:04:00Z", play_id: 2, kexpPlay: {} as KEXPPlay },
        ],
      },
    ];

    const incoming: DoublePlay[] = [
      {
        artist: "Band", title: "Song", dj: "DJ Name", show: "Show Name",
        plays: [
          { timestamp: "2025-04-10T10:04:00Z", play_id: 2, kexpPlay: {} as KEXPPlay },
          { timestamp: "2025-04-10T10:08:00Z", play_id: 3, kexpPlay: {} as KEXPPlay },
        ],
      },
    ];

    const merged = mergeDoublePlays(existing, incoming);

    expect(merged).toHaveLength(1);
    expect(merged[0].dj).toBe("DJ Name");
    expect(merged[0].show).toBe("Show Name");
    expect(merged[0].plays).toHaveLength(3);
  });

  it("should handle case-insensitive artist/title matching", () => {
    const existing: DoublePlay[] = [
      {
        artist: "Band", title: "Song",
        plays: [
          { timestamp: "2025-04-10T10:00:00Z", play_id: 1, kexpPlay: {} as KEXPPlay },
          { timestamp: "2025-04-10T10:04:00Z", play_id: 2, kexpPlay: {} as KEXPPlay },
        ],
      },
    ];

    const incoming: DoublePlay[] = [
      {
        artist: "BAND", title: "SONG",
        plays: [
          { timestamp: "2025-04-10T10:04:00Z", play_id: 2, kexpPlay: {} as KEXPPlay },
          { timestamp: "2025-04-10T10:08:00Z", play_id: 3, kexpPlay: {} as KEXPPlay },
        ],
      },
    ];

    const merged = mergeDoublePlays(existing, incoming);

    expect(merged).toHaveLength(1);
    expect(merged[0].plays).toHaveLength(3);
  });
});

describe("classify", () => {
  it("should classify very short plays as mistakes", () => {
    const plays = [
      { timestamp: "2025-07-08T09:33:17-07:00", play_id: 1, duration: 319, kexpPlay: {} as KEXPPlay },
      { timestamp: "2025-07-08T09:38:36-07:00", play_id: 2, duration: 15, kexpPlay: {} as KEXPPlay },
    ];

    expect(classify(plays)).toBe("mistake");
  });

  it("should classify large duration differences as partial", () => {
    const plays = [
      { timestamp: "2025-07-08T09:00:00-07:00", play_id: 1, duration: 187, kexpPlay: {} as KEXPPlay },
      { timestamp: "2025-07-08T09:05:00-07:00", play_id: 2, duration: 930, kexpPlay: {} as KEXPPlay },
    ];

    expect(classify(plays)).toBe("partial");
  });

  it("should classify reasonable duration differences as legitimate", () => {
    const plays = [
      { timestamp: "2025-07-08T09:00:00-07:00", play_id: 1, duration: 165, kexpPlay: {} as KEXPPlay },
      { timestamp: "2025-07-08T09:05:00-07:00", play_id: 2, duration: 196, kexpPlay: {} as KEXPPlay },
    ];

    expect(classify(plays)).toBe("legitimate");
  });

  it("should classify very short gap without durations as mistake", () => {
    const plays = [
      { timestamp: "2025-07-08T09:00:00Z", play_id: 1, kexpPlay: {} as KEXPPlay },
      { timestamp: "2025-07-08T09:00:20Z", play_id: 2, kexpPlay: {} as KEXPPlay },
    ];

    expect(classify(plays)).toBe("mistake");
  });

  it("should classify short gap without durations as partial", () => {
    const plays = [
      { timestamp: "2025-07-08T09:00:00Z", play_id: 1, kexpPlay: {} as KEXPPlay },
      { timestamp: "2025-07-08T09:00:45Z", play_id: 2, kexpPlay: {} as KEXPPlay },
    ];

    expect(classify(plays)).toBe("partial");
  });

  it("should classify normal gap without durations as legitimate", () => {
    const plays = [
      { timestamp: "2025-07-08T09:00:00Z", play_id: 1, kexpPlay: {} as KEXPPlay },
      { timestamp: "2025-07-08T09:04:00Z", play_id: 2, kexpPlay: {} as KEXPPlay },
    ];

    expect(classify(plays)).toBe("legitimate");
  });

  it("should classify single play as legitimate", () => {
    const plays = [
      { timestamp: "2025-07-08T09:00:00Z", play_id: 1, kexpPlay: {} as KEXPPlay },
    ];

    expect(classify(plays)).toBe("legitimate");
  });
});
