/**
 * 57-31: Character creation wiring over WebSocket.
 *
 * Tests the integration layer that connects the CharacterCreation component
 * to the WebSocket transport. Verifies:
 *  - Session phase routing (connect → creation → game)
 *  - CHARACTER_CREATION messages render the creation UI
 *  - Player responses (choice, freeform, name, confirm) are sent over WS
 *  - Loading state while waiting for server response
 *  - Completion transitions to game view
 *  - Returning players skip creation
 */
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  installWebAudioMock,
  installLocalStorageMock,
} from "@/audio/__tests__/web-audio-mock";
import { AudioEngine } from "@/audio/AudioEngine";

// R3F + drei mocks — App transitively renders dice components that call useLoader.
vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="r3f-canvas">{children}</div>
  ),
  useFrame: vi.fn(),
  useThree: () => ({ camera: {}, size: { width: 800, height: 600 } }),
  useLoader: () => {
    const tex = { wrapS: 0, wrapT: 0, clone() { return { ...this, clone: this.clone }; } };
    return tex;
  },
}));
vi.mock("@react-three/rapier", () => ({
  Physics: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  RigidBody: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  CuboidCollider: () => null,
  ConvexHullCollider: () => null,
}));
vi.mock("@react-three/drei", () => ({
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

import { MemoryRouter } from "react-router-dom";
import App from "../App";
import { MessageType, type GameMessage } from "@/types/protocol";

/** Wrap App in MemoryRouter — App.tsx uses useRoutes() and panics outside a Router. */
function renderApp() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <App />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// MockWebSocket — reusable from useGameSocket tests
// ---------------------------------------------------------------------------
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  static instances: MockWebSocket[] = [];

  url: string;
  readyState: number = MockWebSocket.CONNECTING;

  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;

  sent: GameMessage[] = [];

  send = vi.fn((data: string) => {
    this.sent.push(JSON.parse(data) as GameMessage);
  });
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent("close"));
  });

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event("open"));
  }

  simulateMessage(data: unknown) {
    this.onmessage?.(
      new MessageEvent("message", { data: JSON.stringify(data) }),
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const originalWebSocket = globalThis.WebSocket;

function latestSocket(): MockWebSocket {
  return MockWebSocket.instances[MockWebSocket.instances.length - 1];
}

/** Connect a player through the lobby: fill name, click genre radio, click
 *  world radio (if visible), click Begin, open socket.
 *
 *  The lobby was rebuilt in the #133 rework — genre and world are now
 *  WAI-ARIA radiogroups of buttons, not `<select>` elements, so the test
 *  clicks data-slug-addressable radios instead of calling selectOptions. */
async function connectPlayer(
  user: ReturnType<typeof userEvent.setup>,
  playerName = "TestHero",
  genre = "low_fantasy",
) {
  const nameInput = screen.getByLabelText(/player name/i);
  await user.clear(nameInput);
  await user.type(nameInput, playerName);

  // Let the genres fetch resolve so the radiogroup populates.
  await act(async () => {
    vi.advanceTimersByTime(100);
  });

  // Expand the genre's accordion section (Standing Folio lobby, story 83-1).
  // Genres are collapsible header buttons (one open by default); each section
  // is scoped by a [data-genre] wrapper. Selecting a WORLD radio inside it is
  // what sets the (genre, world) selection — clicking the header only expands.
  const genreHeader = document
    .querySelector(`[data-genre="${genre}"]`)
    ?.querySelector<HTMLButtonElement>('button[aria-expanded]');
  if (genreHeader && genreHeader.getAttribute("aria-expanded") !== "true") {
    await user.click(genreHeader);
  }

  // Let the world list render after the genre expands.
  await act(async () => {
    vi.advanceTimersByTime(100);
  });

  // Click the first world radio inside the expanded genre's radiogroup, unless
  // one is already selected (e.g. an auto-selected single world).
  const worldGroup = document
    .querySelector(`[data-genre="${genre}"]`)
    ?.querySelector('[role="radiogroup"]');
  if (worldGroup) {
    const selectedWorld = worldGroup.querySelector<HTMLButtonElement>(
      '[role="radio"][aria-checked="true"]',
    );
    if (!selectedWorld) {
      const firstWorld = worldGroup.querySelector<HTMLButtonElement>('[role="radio"]');
      if (firstWorld) await user.click(firstWorld);
    }
  }

  const connectBtn = screen.getByRole("button", { name: /connect|join|play|begin|start/i });
  await user.click(connectBtn);

  // The slug-mode flow fires POST /api/games, navigates to /solo/<slug>,
  // then AppInner's slug effect runs GET /api/games/<slug>, calls connect()
  // (which constructs the WebSocket), and finally schedules the
  // SESSION_EVENT{connect} 300ms after the socket opens. Flush microtasks +
  // timers so `latestSocket()` resolves to the slug-mode socket below.
  await act(async () => {
    vi.advanceTimersByTime(100);
  });

  // Let the WebSocket handshake complete
  await act(async () => {
    latestSocket().simulateOpen();
  });

  // Advance past the SESSION_EVENT{connect} timeout (300ms) inside AppInner.
  await act(async () => {
    vi.advanceTimersByTime(500);
  });
}

/** Build a CHARACTER_CREATION scene message from the server. */
function sceneMessage(overrides: {
  phase?: string;
  scene_index?: number;
  total_scenes?: number;
  prompt?: string;
  choices?: Array<{ label: string; description: string }>;
  allows_freeform?: boolean;
  input_type?: string;
  character_preview?: Record<string, unknown>;
}): GameMessage {
  return {
    type: MessageType.CHARACTER_CREATION,
    payload: {
      phase: "scene",
      scene_index: 0,
      total_scenes: 3,
      prompt: "The mists part to reveal your origin...",
      choices: [],
      input_type: "choice",
      character_preview: {},
      ...overrides,
    },
    player_id: "test-player",
  };
}

/** Build a CHARACTER_CREATION complete message. */
function completeMessage(character: Record<string, unknown> = {}): GameMessage {
  return {
    type: MessageType.CHARACTER_CREATION,
    payload: {
      phase: "complete",
      character: {
        name: "TestHero",
        class: "warrior",
        ...character,
      },
    },
    player_id: "test-player",
  };
}

/** Build a SESSION_EVENT message for returning players. */
function sessionReadyMessage(): GameMessage {
  return {
    type: MessageType.SESSION_EVENT,
    payload: {
      event: "ready",
      player_name: "TestHero",
      has_character: true,
    },
    player_id: "test-player",
  };
}

/** Build a SESSION_EVENT message for new players. */
function sessionConnectedMessage(): GameMessage {
  return {
    type: MessageType.SESSION_EVENT,
    payload: {
      event: "connected",
      player_name: "TestHero",
      has_character: false,
    },
    player_id: "test-player",
  };
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------
const originalFetch = globalThis.fetch;

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  AudioEngine.resetInstance();
  installWebAudioMock();
  installLocalStorageMock();
  // Mock matchMedia for useBreakpoint. Report "mobile" so GameBoard renders
  // via MobileTabView instead of dockview — see src/test-setup.ts for the
  // rationale (dockview does not render panel content in jsdom).
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("max-width: 767px"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  MockWebSocket.instances = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.WebSocket = MockWebSocket as any;
  // Mock `/api/genres` and `/api/sessions` — the lobby (rework #133) expects
  // the rich GenresResponse shape (GenreMeta with worlds: WorldMeta[]) and
  // polls /api/sessions every 15s for the CurrentSessions panel. Return
  // fixture data for both so ConnectScreen renders without hitting the
  // ErrorBoundary's "Something went wrong" fallback.
  const fakeWorld = (slug: string, name: string) => ({
    slug,
    name,
    description: `${name} — test fixture.`,
    era: null,
    setting: null,
    inspirations: [],
    axis_snapshot: {},
    hero_image: null,
  });
  const fakeGenresResponse = {
    low_fantasy: {
      name: "Low Fantasy",
      description: "Grounded sword-and-sorcery.",
      worlds: [fakeWorld("default", "Default")],
    },
    road_warrior: {
      name: "Road Warrior",
      description: "Post-apocalyptic wasteland.",
      worlds: [fakeWorld("wasteland", "Wasteland")],
    },
    elemental_harmony: {
      name: "Elemental Harmony",
      description: "Spirit-kingdom intrigue.",
      worlds: [
        fakeWorld("burning_peace", "Burning Peace"),
        fakeWorld("shattered_accord", "Shattered Accord"),
      ],
    },
  };
  globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    // POST /api/games — start-game endpoint introduced when the lobby moved to
    // slug-mode. Returns the canonical slug-mode handshake payload so the
    // post-Start `navigate(/solo/<slug>)` lands on a route that AppInner can
    // hydrate via GET /api/games/:slug below.
    if (url.includes("/api/games") && init?.method === "POST") {
      return Promise.resolve({
        ok: true,
        json: async () => ({ slug: "test-game-slug", mode: "solo" }),
      } as Response);
    }
    // GET /api/games/:slug — slug-mode metadata fetch fired by AppInner once
    // the URL transitions to /solo/<slug>. Echoes the genre/world the test
    // selected (low_fantasy default) so theming and session state hydrate.
    if (url.match(/\/api\/games\/[^/]+$/)) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          genre_slug: "low_fantasy",
          world_slug: "shimmering_dale",
          mode: "solo",
        }),
      } as Response);
    }
    if (url.includes("/api/sessions")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ sessions: [] }),
      } as Response);
    }
    return Promise.resolve({
      ok: true,
      json: async () => fakeGenresResponse,
    } as Response);
  }) as unknown as typeof fetch;
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  AudioEngine.resetInstance();
  globalThis.WebSocket = originalWebSocket;
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// AC-1: New player enters character creation
// ---------------------------------------------------------------------------
describe("AC-1: new player enters character creation", () => {
  it("renders CharacterCreation when server signals new player", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp();
    // Wait for ConnectScreen to render after App mounts
    // Advance timers to let App initialize
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    await connectPlayer(user);

    // Server says: new player, no character
    await act(async () => {
      latestSocket().simulateMessage(sessionConnectedMessage());
    });

    // Server sends first creation scene
    await act(async () => {
      latestSocket().simulateMessage(
        sceneMessage({
          scene_index: 0,
          prompt: "The mists part to reveal your origin...",
          choices: [{ label: "Noble birth", description: "" }, { label: "Street orphan", description: "" }, { label: "Foreign traveler", description: "" }],
          input_type: "choice",
        }),
      );
    });

    // CharacterCreation should be visible, NOT GameView
    expect(
      screen.getByTestId("character-creation"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("game-board")).not.toBeInTheDocument();
  });

  it("displays the first scene narration text", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp();
    // Wait for ConnectScreen to render after App mounts
    // Advance timers to let App initialize
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    await connectPlayer(user);

    await act(async () => {
      latestSocket().simulateMessage(sessionConnectedMessage());
    });

    await act(async () => {
      latestSocket().simulateMessage(
        sceneMessage({
          prompt: "You stand at the crossroads of fate.",
          choices: [{ label: "Path of honor", description: "" }, { label: "Path of shadow", description: "" }],
          input_type: "choice",
        }),
      );
    });

    expect(
      screen.getByText(/crossroads of fate/i),
    ).toBeInTheDocument();
  });

  it("displays scene progress (e.g. 1 of 3)", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp();
    // Wait for ConnectScreen to render after App mounts
    // Advance timers to let App initialize
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    await connectPlayer(user);

    await act(async () => {
      latestSocket().simulateMessage(sessionConnectedMessage());
    });

    await act(async () => {
      latestSocket().simulateMessage(
        sceneMessage({ scene_index: 0, total_scenes: 3 }),
      );
    });

    // Progress indicator should be visible
    // Progress indicator renders as Roman numeral in absolute positioned span
    const progressSpan = screen.getByText("i", { selector: "span.absolute" });
    expect(progressSpan).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// AC-2: Choice response advances builder
// ---------------------------------------------------------------------------
describe("AC-2: choice response advances builder", () => {
  it("sends CHARACTER_CREATION choice response when player clicks a choice", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp();
    // Wait for ConnectScreen to render after App mounts
    // Advance timers to let App initialize
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    await connectPlayer(user);

    await act(async () => {
      latestSocket().simulateMessage(sessionConnectedMessage());
    });

    await act(async () => {
      latestSocket().simulateMessage(
        sceneMessage({
          choices: [{ label: "Noble birth", description: "" }, { label: "Street orphan", description: "" }, { label: "Foreign traveler", description: "" }],
          input_type: "choice",
        }),
      );
    });

    // Click first choice
    const choiceBtn = screen.getByRole("button", { name: /noble birth/i });
    await user.click(choiceBtn);

    // Verify the WebSocket message sent
    const ws = latestSocket();
    const creationMsgs = ws.sent.filter(
      (m) => m.type === MessageType.CHARACTER_CREATION,
    );
    expect(creationMsgs.length).toBeGreaterThanOrEqual(1);

    const choiceMsg = creationMsgs.find(
      (m) => (m.payload as Record<string, unknown>).choice === "1",
    );
    expect(choiceMsg).toBeDefined();
    expect(choiceMsg!.payload).toMatchObject({
      phase: "scene",
      choice: "1",
    });
  });

  it("renders the next scene after server responds to choice", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp();
    // Wait for ConnectScreen to render after App mounts
    // Advance timers to let App initialize
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    await connectPlayer(user);

    await act(async () => {
      latestSocket().simulateMessage(sessionConnectedMessage());
    });

    // Scene 1
    await act(async () => {
      latestSocket().simulateMessage(
        sceneMessage({
          scene_index: 0,
          prompt: "Choose your origin.",
          choices: [{ label: "Noble", description: "" }, { label: "Commoner", description: "" }],
          input_type: "choice",
        }),
      );
    });

    const choiceBtn = screen.getByRole("button", { name: /noble/i });
    await user.click(choiceBtn);

    // Server sends scene 2
    await act(async () => {
      latestSocket().simulateMessage(
        sceneMessage({
          scene_index: 1,
          prompt: "Now choose your calling.",
          choices: [{ label: "Warrior", description: "" }, { label: "Mage", description: "" }],
          input_type: "choice",
        }),
      );
    });

    expect(screen.getByText(/choose your calling/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// AC-3: Freeform and name input work
// ---------------------------------------------------------------------------
describe("AC-3: freeform and name input", () => {
  it("sends freeform response for text input scenes", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp();
    // Wait for ConnectScreen to render after App mounts
    // Advance timers to let App initialize
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    await connectPlayer(user);

    await act(async () => {
      latestSocket().simulateMessage(sessionConnectedMessage());
    });

    await act(async () => {
      latestSocket().simulateMessage(
        sceneMessage({
          prompt: "Describe your character's greatest fear.",
          input_type: "freeform",
          choices: [],
        }),
      );
    });

    // Type in the freeform field and submit
    const input = screen.getByRole("textbox");
    await user.type(input, "The darkness beneath the mountain");
    const submitBtn = screen.getByRole("button", { name: /submit|send|continue/i });
    await user.click(submitBtn);

    const ws = latestSocket();
    const freeformMsg = ws.sent.find(
      (m) =>
        m.type === MessageType.CHARACTER_CREATION &&
        (m.payload as Record<string, unknown>).phase === "scene" &&
        typeof (m.payload as Record<string, unknown>).choice === "string",
    );
    expect(freeformMsg).toBeDefined();
    expect(freeformMsg!.payload).toMatchObject({
      phase: "scene",
      choice: "The darkness beneath the mountain",
    });
  });

  it("sends name response for name input scenes", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp();
    // Wait for ConnectScreen to render after App mounts
    // Advance timers to let App initialize
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    await connectPlayer(user);

    await act(async () => {
      latestSocket().simulateMessage(sessionConnectedMessage());
    });

    await act(async () => {
      latestSocket().simulateMessage(
        sceneMessage({
          prompt: "What name do you carry?",
          input_type: "name",
          choices: [],
        }),
      );
    });

    const input = screen.getByRole("textbox");
    await user.type(input, "Aldric Stormborn");
    const submitBtn = screen.getByRole("button", { name: /submit|send|continue|confirm/i });
    await user.click(submitBtn);

    const ws = latestSocket();
    const nameMsg = ws.sent.find(
      (m) =>
        m.type === MessageType.CHARACTER_CREATION &&
        (m.payload as Record<string, unknown>).phase === "scene" &&
        (m.payload as Record<string, unknown>).choice === "Aldric Stormborn",
    );
    expect(nameMsg).toBeDefined();
    expect(nameMsg!.payload).toMatchObject({
      phase: "scene",
      choice: "Aldric Stormborn",
    });
  });
});

// ---------------------------------------------------------------------------
// AC-4: Complete transitions to game view
// ---------------------------------------------------------------------------
describe("AC-4: complete transitions to game view", () => {
  it("sends confirm action after final scene", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp();
    // Wait for ConnectScreen to render after App mounts
    // Advance timers to let App initialize
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    await connectPlayer(user);

    await act(async () => {
      latestSocket().simulateMessage(sessionConnectedMessage());
    });

    // Final scene with character preview
    await act(async () => {
      latestSocket().simulateMessage(
        sceneMessage({
          scene_index: 2,
          total_scenes: 3,
          prompt: "Your character is ready. Confirm?",
          input_type: "confirm",
          character_preview: { name: "TestHero", class: "warrior" },
        }),
      );
    });

    const confirmBtn = screen.getByRole("button", { name: /confirm|accept|begin/i });
    await user.click(confirmBtn);

    const ws = latestSocket();
    const confirmMsg = ws.sent.find(
      (m) =>
        m.type === MessageType.CHARACTER_CREATION &&
        (m.payload as Record<string, unknown>).phase === "confirmation" &&
        (m.payload as Record<string, unknown>).choice === "1",
    );
    expect(confirmMsg).toBeDefined();
  });

  it("transitions to game view when server sends complete", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp();
    // Wait for ConnectScreen to render after App mounts
    // Advance timers to let App initialize
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    await connectPlayer(user);

    await act(async () => {
      latestSocket().simulateMessage(sessionConnectedMessage());
    });

    // Go through a scene first
    await act(async () => {
      latestSocket().simulateMessage(
        sceneMessage({ input_type: "choice", choices: [{ label: "A", description: "" }, { label: "B", description: "" }] }),
      );
    });

    // Server sends complete
    await act(async () => {
      latestSocket().simulateMessage(completeMessage({ name: "TestHero" }));
    });

    // GameView should now be rendered, creation should be gone
    expect(screen.queryByTestId("character-creation")).not.toBeInTheDocument();
    expect(screen.getByTestId("game-board")).toBeInTheDocument();
  });

  it("integrates character into GameState after completion", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp();
    // Wait for ConnectScreen to render after App mounts
    // Advance timers to let App initialize
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    await connectPlayer(user);

    await act(async () => {
      latestSocket().simulateMessage(sessionConnectedMessage());
    });

    await act(async () => {
      latestSocket().simulateMessage(
        sceneMessage({ input_type: "choice", choices: [{ label: "A", description: "" }] }),
      );
    });

    // Complete with character data
    await act(async () => {
      latestSocket().simulateMessage(
        completeMessage({
          name: "TestHero",
          class: "warrior",
          hp: 20,
          max_hp: 20,
        }),
      );
    });

    // After a NARRATION arrives, the game view should show character info
    await act(async () => {
      latestSocket().simulateMessage({
        type: MessageType.NARRATION,
        payload: {
          text: "Welcome to the world, TestHero.",
        },
        player_id: "test-player",
      });
    });

    // Advance past the 500ms narration buffer flush timer
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    // The character name should appear somewhere in the game view
    expect(screen.getByText(/TestHero/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// AC-5: Returning player skips creation
// ---------------------------------------------------------------------------
describe("AC-5: returning player skips creation", () => {
  it("renders GameView directly when server signals existing character", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp();
    // Wait for ConnectScreen to render after App mounts
    // Advance timers to let App initialize
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    await connectPlayer(user);

    // Server says: returning player, has character
    await act(async () => {
      latestSocket().simulateMessage(sessionReadyMessage());
    });

    // Should go straight to game view — no creation
    expect(screen.queryByTestId("character-creation")).not.toBeInTheDocument();
    expect(screen.getByTestId("game-board")).toBeInTheDocument();
  });

  it("does not receive CHARACTER_CREATION messages for returning player", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp();
    // Wait for ConnectScreen to render after App mounts
    // Advance timers to let App initialize
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    await connectPlayer(user);

    await act(async () => {
      latestSocket().simulateMessage(sessionReadyMessage());
    });

    // Even if a rogue CHARACTER_CREATION arrives, game view stays
    await act(async () => {
      latestSocket().simulateMessage(
        sceneMessage({ prompt: "Should not render" }),
      );
    });

    expect(screen.queryByTestId("character-creation")).not.toBeInTheDocument();
    expect(screen.getByTestId("game-board")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------
describe("loading state during creation", () => {
  it("shows loading indicator after player sends response", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp();
    // Wait for ConnectScreen to render after App mounts
    // Advance timers to let App initialize
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    await connectPlayer(user);

    await act(async () => {
      latestSocket().simulateMessage(sessionConnectedMessage());
    });

    await act(async () => {
      latestSocket().simulateMessage(
        sceneMessage({
          choices: [{ label: "Warrior", description: "" }, { label: "Mage", description: "" }],
          input_type: "choice",
        }),
      );
    });

    // Make a choice
    const choiceBtn = screen.getByRole("button", { name: /warrior/i });
    await user.click(choiceBtn);

    // Loading should be visible while waiting for next scene
    expect(
      screen.getByTestId("creation-loading") ??
        screen.getByRole("status"),
    ).toBeInTheDocument();
  });

  it("hides loading indicator when next scene arrives", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp();
    // Wait for ConnectScreen to render after App mounts
    // Advance timers to let App initialize
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    await connectPlayer(user);

    await act(async () => {
      latestSocket().simulateMessage(sessionConnectedMessage());
    });

    await act(async () => {
      latestSocket().simulateMessage(
        sceneMessage({
          choices: [{ label: "Warrior", description: "" }, { label: "Mage", description: "" }],
          input_type: "choice",
        }),
      );
    });

    const choiceBtn = screen.getByRole("button", { name: /warrior/i });
    await user.click(choiceBtn);

    // Next scene arrives
    await act(async () => {
      latestSocket().simulateMessage(
        sceneMessage({
          scene_index: 1,
          prompt: "Choose your weapon.",
          choices: [{ label: "Sword", description: "" }, { label: "Staff", description: "" }],
          input_type: "choice",
        }),
      );
    });

    expect(screen.queryByTestId("creation-loading")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Edge cases — paranoid TEA coverage
// ---------------------------------------------------------------------------
describe("edge cases", () => {
  it("does not crash if CHARACTER_CREATION arrives before session event", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp();
    // Wait for ConnectScreen to render after App mounts
    // Advance timers to let App initialize
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    await connectPlayer(user);

    // Scene arrives before session event — should not crash
    await act(async () => {
      latestSocket().simulateMessage(
        sceneMessage({ prompt: "Early scene" }),
      );
    });

    // App should still be functional
    expect(screen.getByTestId("app")).toBeInTheDocument();
  });

  it("handles empty choices array gracefully on choice scene", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp();
    // Wait for ConnectScreen to render after App mounts
    // Advance timers to let App initialize
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    await connectPlayer(user);

    await act(async () => {
      latestSocket().simulateMessage(sessionConnectedMessage());
    });

    // Malformed scene: choice type but no choices
    await act(async () => {
      latestSocket().simulateMessage(
        sceneMessage({
          input_type: "choice",
          choices: [],
          prompt: "A moment of silence.",
        }),
      );
    });

    // Should render narration without crashing
    expect(screen.getByText(/moment of silence/i)).toBeInTheDocument();
  });
});
