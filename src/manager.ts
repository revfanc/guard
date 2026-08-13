import type {
  BackAttempt,
  BackAttemptSource,
  BackGuard,
  BackGuardOptions,
  BackGuardStatus,
} from "./types";

const MANAGER_SYMBOL = Symbol.for("@revfanc/guard.manager");
const STATE_KEY = "__revfanc_guard__";
const STATE_VERSION = 1;

type CleanupMode = "stay" | "leave";
type ManagerPhase = "active" | "cleaning" | "closed";

interface SentinelMarker {
  package: "@revfanc/guard";
  version: 1;
  id: string;
  wrapped: boolean;
  hadPrevious?: boolean;
  previous?: unknown;
  original?: unknown;
}

interface GuardRecord {
  readonly id: number;
  readonly options: BackGuardOptions;
  status: BackGuardStatus;
  attemptToken?: symbol;
}

type WindowWithManager = Window & {
  [MANAGER_SYMBOL]?: GuardRuntime;
};

interface GuardRuntime {
  manager?: GuardManager;
  readonly listener: (event: PopStateEvent) => void;
}

let guardSequence = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function createId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function readMarker(state: unknown): SentinelMarker | undefined {
  if (!isRecord(state)) {
    return undefined;
  }

  const marker = state[STATE_KEY];
  if (!isRecord(marker)) {
    return undefined;
  }

  if (
    marker.package !== "@revfanc/guard" ||
    marker.version !== STATE_VERSION ||
    typeof marker.id !== "string" ||
    typeof marker.wrapped !== "boolean"
  ) {
    return undefined;
  }

  return marker as unknown as SentinelMarker;
}

function createSentinelState(state: unknown, id: string): Record<string, unknown> {
  if (isRecord(state)) {
    const hadPrevious = Object.prototype.hasOwnProperty.call(state, STATE_KEY);
    const marker: SentinelMarker = {
      package: "@revfanc/guard",
      version: STATE_VERSION,
      id,
      wrapped: false,
      hadPrevious,
      previous: hadPrevious ? state[STATE_KEY] : undefined,
    };

    return { ...state, [STATE_KEY]: marker };
  }

  const marker: SentinelMarker = {
    package: "@revfanc/guard",
    version: STATE_VERSION,
    id,
    wrapped: true,
    original: state,
  };

  return { [STATE_KEY]: marker };
}

function restoreSentinelState(state: unknown, marker: SentinelMarker): unknown {
  if (marker.wrapped) {
    return marker.original;
  }

  if (!isRecord(state)) {
    return null;
  }

  const restored = { ...state };
  if (marker.hadPrevious) {
    restored[STATE_KEY] = marker.previous;
  } else {
    delete restored[STATE_KEY];
  }

  return restored;
}

function reportError(target: Window, record: GuardRecord | undefined, error: unknown): void {
  if (record?.options.onError) {
    try {
      record.options.onError(error);
      return;
    } catch (onErrorFailure) {
      error = onErrorFailure;
    }
  }

  if (typeof target.reportError === "function") {
    target.reportError(error);
    return;
  }

  target.setTimeout(() => {
    throw error;
  }, 0);
}

class GuardManager {
  readonly #target: WindowWithManager;
  readonly #guards: GuardRecord[] = [];
  readonly #sentinelId: string;
  #baseState: unknown;
  #baseUrl: string;
  #phase: ManagerPhase = "active";
  #cleanupPopIsRealNavigation = false;
  #cleanupErrorRecord?: GuardRecord;
  #currentIsSentinel = false;
  #hadPreviousEntry: boolean;

  constructor(target: WindowWithManager) {
    this.#target = target;
    this.#hadPreviousEntry = target.history.length > 1;

    const existingMarker = readMarker(target.history.state);
    if (existingMarker) {
      this.#sentinelId = existingMarker.id;
      this.#baseState = restoreSentinelState(target.history.state, existingMarker);
      this.#baseUrl = target.location.href;
      this.#currentIsSentinel = true;
    } else {
      this.#sentinelId = createId();
      this.#baseState = target.history.state;
      this.#baseUrl = target.location.href;
    }

    if (!this.#currentIsSentinel) {
      try {
        this.#pushSentinel();
      } catch (error) {
        this.#phase = "closed";
        throw error;
      }
    }
  }

  add(options: BackGuardOptions): BackGuard {
    if (this.#phase !== "active") {
      throw new Error("@revfanc/guard: the current guard manager is closing.");
    }

    const previousTop = this.#top();
    if (previousTop?.status === "triggered") {
      previousTop.attemptToken = undefined;
      previousTop.status = "armed";
    }

    const record: GuardRecord = {
      id: ++guardSequence,
      options,
      status: "armed",
    };
    this.#guards.push(record);

    return {
      get status() {
        return record.status;
      },
      dispose: () => this.#dispose(record),
    };
  }

  #top(): GuardRecord | undefined {
    return this.#guards.at(-1);
  }

  #pushSentinel(): void {
    const sentinelState = createSentinelState(this.#baseState, this.#sentinelId);
    this.#target.history.pushState(sentinelState, "", this.#baseUrl);
    this.#currentIsSentinel = true;
  }

  #isOwnSentinel(state: unknown): boolean {
    return readMarker(state)?.id === this.#sentinelId;
  }

  handlePopState(event: PopStateEvent): void {
    if (this.#phase === "closed") {
      return;
    }

    if (this.#isOwnSentinel(event.state)) {
      this.#currentIsSentinel = true;
      return;
    }

    if (!this.#currentIsSentinel) {
      return;
    }

    this.#currentIsSentinel = false;
    this.#baseState = event.state;
    this.#baseUrl = this.#target.location.href;

    if (this.#phase === "cleaning") {
      if (!this.#cleanupPopIsRealNavigation) {
        event.stopImmediatePropagation();
      }
      this.#finishCleanup();
      return;
    }

    event.stopImmediatePropagation();

    try {
      this.#pushSentinel();
    } catch (error) {
      const top = this.#top();
      this.#close();
      reportError(this.#target, top, error);
      return;
    }

    this.#dispatch("history");
  }

  #dispatch(source: BackAttemptSource): void {
    const record = this.#top();
    if (!record || record.status !== "armed") {
      return;
    }

    const token = Symbol("back-attempt");
    record.attemptToken = token;
    record.status = "triggered";

    const attempt: BackAttempt = {
      source,
      leave: () => this.#leave(record, token),
      reset: () => this.#reset(record, token),
    };

    try {
      const result = record.options.onBack(attempt);
      if (result && typeof result.then === "function") {
        void Promise.resolve(result).catch((error) => {
          reportError(this.#target, record, error);
        });
      }
    } catch (error) {
      reportError(this.#target, record, error);
    }
  }

  #isCurrentAttempt(record: GuardRecord, token: symbol): boolean {
    return (
      this.#phase === "active" &&
      this.#top() === record &&
      record.status === "triggered" &&
      record.attemptToken === token
    );
  }

  #reset(record: GuardRecord, token: symbol): boolean {
    if (!this.#isCurrentAttempt(record, token)) {
      return false;
    }

    record.attemptToken = undefined;
    record.status = "armed";
    return true;
  }

  #leave(record: GuardRecord, token: symbol): boolean {
    if (!this.#isCurrentAttempt(record, token)) {
      return false;
    }

    this.#guards.pop();
    record.attemptToken = undefined;
    record.status = "disposed";

    if (this.#guards.length > 0) {
      this.#dispatch("cascade");
    } else {
      this.#beginCleanup("leave", record);
    }

    return true;
  }

  #dispose(record: GuardRecord): void {
    if (record.status === "disposed") {
      return;
    }

    const index = this.#guards.indexOf(record);
    if (index >= 0) {
      this.#guards.splice(index, 1);
    }

    record.attemptToken = undefined;
    record.status = "disposed";

    if (this.#guards.length === 0 && this.#phase === "active") {
      this.#beginCleanup("stay", record);
    }
  }

  #beginCleanup(mode: CleanupMode, errorRecord: GuardRecord): void {
    this.#phase = "cleaning";
    this.#cleanupPopIsRealNavigation = mode === "leave" && this.#hadPreviousEntry;
    this.#cleanupErrorRecord = errorRecord;

    if (!this.#currentIsSentinel || !this.#isOwnSentinel(this.#target.history.state)) {
      this.#finishCleanup();
      return;
    }

    try {
      if (this.#cleanupPopIsRealNavigation) {
        this.#target.setTimeout(() => {
          try {
            this.#target.history.go(-2);
          } catch (error) {
            this.#close();
            reportError(this.#target, this.#cleanupErrorRecord, error);
          }
        }, 0);
        return;
      }

      this.#target.history.back();
    } catch (error) {
      this.#close();
      reportError(this.#target, this.#cleanupErrorRecord, error);
    }
  }

  #finishCleanup(): void {
    this.#close();
  }

  #close(): void {
    this.#phase = "closed";
    const runtime = this.#target[MANAGER_SYMBOL];
    if (runtime?.manager === this) {
      runtime.manager = undefined;
    }
  }
}

export function getWindow(): WindowWithManager | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window as WindowWithManager;
}

export function getOrCreateManager(): GuardManager {
  const target = getWindow();
  if (!target) {
    throw new Error("@revfanc/guard: window is not available.");
  }

  const runtime = prepareRuntime(target);
  if (runtime.manager) {
    return runtime.manager;
  }

  const manager = new GuardManager(target);
  runtime.manager = manager;
  return manager;
}

function prepareRuntime(target = getWindow()): GuardRuntime {
  if (!target) {
    return { listener: () => undefined };
  }

  const existing = target[MANAGER_SYMBOL];
  if (existing) {
    return existing;
  }

  const runtime: GuardRuntime = {
    listener(event) {
      runtime.manager?.handlePopState(event);
    },
  };
  target[MANAGER_SYMBOL] = runtime;
  target.addEventListener("popstate", runtime.listener, { capture: true });
  return runtime;
}

export function prepareBackGuardRuntime(): void {
  prepareRuntime();
}
