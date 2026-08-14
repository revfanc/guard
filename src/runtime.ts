import { createHistoryPort, type HistoryPort, type Sentinel } from "./history";
import type { BackAttempt, BackGuard, BackHandler } from "./types";

const RUNTIME_SYMBOL = Symbol.for("@revfanc/guard.runtime.v3");
const SENTINEL_REPLACED =
  "@revfanc/guard: the history sentinel was replaced.";
const BACK_COMMITTED =
  "@revfanc/guard: a Back navigation is already being allowed.";
const CLOSED = Symbol("closed");

type Outcome = typeof CLOSED | { error: unknown };
type Layer = {
  onBack: BackHandler;
  attempt?: BackAttempt;
  outcome?: Outcome;
  closed: Promise<Outcome>;
  close(outcome: Outcome): void;
};
type Anchored = { phase: "anchored"; sentinel: Sentinel; layers: Layer[] };
type Traversing = {
  phase: "traversing";
  sentinel: Sentinel;
  owner: Layer;
  restart: Layer[];
  next: "restart" | "back";
};
type State = { phase: "idle" } | Anchored | Traversing;
type RuntimeWindow = Window & { [RUNTIME_SYMBOL]?: WindowCoordinator };

function createLayer(onBack: BackHandler): Layer {
  let close!: (outcome: Outcome) => void;
  const closed = new Promise<Outcome>((resolve) => {
    close = resolve;
  });
  return { onBack, closed, close };
}

function waitFor(layer: Layer): Promise<void> {
  const result = layer.outcome
    ? Promise.resolve(layer.outcome)
    : layer.closed;
  return result.then((outcome) => {
    if (outcome !== CLOSED) throw outcome.error;
  });
}

function invoke(
  operation: () => void | PromiseLike<void>,
  complete: () => void,
  fail: (error: unknown) => void,
): void {
  try {
    const result = operation();
    if (result && typeof result.then === "function") {
      Promise.resolve(result).then(complete, fail);
    } else {
      complete();
    }
  } catch (error) {
    fail(error);
  }
}

export class WindowCoordinator {
  private state: State = { phase: "idle" };

  constructor(private readonly history: HistoryPort) {
    history.listen((state, intercept) => this.onChange(state, intercept));
  }

  add(onBack: BackHandler): BackGuard {
    const layer = createLayer(onBack);
    const state = this.state;

    if (state.phase === "idle") {
      this.anchor([layer]);
    } else if (state.phase === "anchored") {
      if (!state.sentinel.isCurrent()) {
        const error = new Error(SENTINEL_REPLACED);
        this.fail(state.layers, error, false);
        throw error;
      }
      state.layers.push(layer);
    } else if (state.next === "back") {
      throw new Error(BACK_COMMITTED);
    } else {
      state.restart.push(layer);
    }
    return { dispose: () => this.dispose(layer) };
  }

  private anchor(layers: Layer[]): void {
    this.state = {
      phase: "anchored",
      sentinel: this.history.createSentinel(),
      layers,
    };
  }

  private top(layers: Layer[]): Layer | undefined {
    return layers[layers.length - 1];
  }

  private onChange(eventState: unknown, intercept: () => void): void {
    const current = this.state;
    if (current.phase === "anchored") {
      this.onBack(current, eventState, intercept);
    } else if (current.phase === "traversing") {
      this.onTraversed(current, eventState, intercept);
    }
  }

  private onBack(
    state: Anchored,
    eventState: unknown,
    intercept: () => void,
  ): void {
    if (state.sentinel.matches(eventState)) return;
    if (!state.sentinel.isAtBase(eventState)) {
      this.fail(
        state.layers,
        new Error("@revfanc/guard: back navigation missed the guarded base."),
      );
      return;
    }

    intercept();
    try {
      state.sentinel.restore(eventState);
    } catch (error) {
      this.fail(state.layers, error);
      return;
    }

    const layer = this.top(state.layers);
    if (layer && !layer.attempt) this.dispatch(layer);
  }

  private onTraversed(
    state: Traversing,
    eventState: unknown,
    intercept: () => void,
  ): void {
    if (!state.sentinel.isAtBase(eventState)) {
      this.fail(
        [state.owner, ...state.restart],
        new Error("@revfanc/guard: sentinel cleanup missed its base."),
      );
      return;
    }

    intercept();
    this.close(state.owner, CLOSED);
    if (state.next === "back") {
      this.state = { phase: "idle" };
      try {
        this.history.back();
      } catch (error) {
        this.history.report(error);
      }
    } else if (state.restart.length === 0) {
      this.state = { phase: "idle" };
    } else {
      try {
        this.anchor(state.restart);
      } catch (error) {
        this.fail(state.restart, error);
      }
    }
  }

  private dispatch(layer: Layer): void {
    const attempt: BackAttempt = {
      allow: () => this.allow(layer, attempt),
    };
    layer.attempt = attempt;
    invoke(
      () => layer.onBack(attempt),
      () => this.finishAttempt(layer, attempt),
      (error) => {
        this.finishAttempt(layer, attempt);
        this.history.report(error);
      },
    );
  }

  private finishAttempt(layer: Layer, attempt: BackAttempt): void {
    if (layer.attempt === attempt) layer.attempt = undefined;
  }

  private allow(layer: Layer, attempt: BackAttempt): boolean {
    const state = this.state;
    if (
      state.phase !== "anchored" ||
      this.top(state.layers) !== layer ||
      layer.attempt !== attempt ||
      !this.owns(state)
    ) {
      return false;
    }

    if (state.layers.length === 1) {
      return this.traverse(state, layer, "back", true) === undefined;
    }
    state.layers.pop();
    this.close(layer, CLOSED);
    return true;
  }

  private dispose(layer: Layer): Promise<void> {
    if (layer.outcome) return waitFor(layer);
    const state = this.state;

    if (state.phase === "traversing") {
      if (state.owner === layer) return waitFor(layer);
      const index = state.restart.indexOf(layer);
      if (index >= 0) {
        state.restart.splice(index, 1);
        this.close(layer, CLOSED);
        return waitFor(layer);
      }
    } else if (state.phase === "anchored") {
      const index = state.layers.indexOf(layer);
      if (index >= 0) {
        if (!state.sentinel.isCurrent()) {
          const error = new Error(SENTINEL_REPLACED);
          this.fail(state.layers, error, false);
          return waitFor(layer);
        }
        if (state.layers.length > 1) {
          state.layers.splice(index, 1);
          this.close(layer, CLOSED);
          return waitFor(layer);
        }

        const error = this.traverse(state, layer, "restart", false);
        return error && !layer.outcome
          ? Promise.reject(error)
          : waitFor(layer);
      }
    }

    const error = new Error("@revfanc/guard: the guard is no longer active.");
    this.close(layer, { error });
    return waitFor(layer);
  }

  private traverse(
    state: Anchored,
    layer: Layer,
    next: Traversing["next"],
    reportFailure: boolean,
  ): unknown | undefined {
    this.state = {
      phase: "traversing",
      sentinel: state.sentinel,
      owner: layer,
      restart: [],
      next,
    };
    try {
      state.sentinel.release();
    } catch (error) {
      if (state.sentinel.isCurrent()) {
        this.state = state;
      } else {
        this.fail(state.layers, error, false);
      }
      if (reportFailure) this.history.report(error);
      return error;
    }

    layer.attempt = undefined;
    return undefined;
  }

  private owns(state: Anchored): boolean {
    if (state.sentinel.isCurrent()) return true;
    this.fail(state.layers, new Error(SENTINEL_REPLACED));
    return false;
  }

  private close(layer: Layer, outcome: Outcome): void {
    if (layer.outcome) return;
    layer.attempt = undefined;
    layer.outcome = outcome;
    layer.close(outcome);
  }

  private fail(layers: Layer[], error: unknown, report = true): void {
    for (const layer of layers) this.close(layer, { error });
    this.state = { phase: "idle" };
    if (report) this.history.report(error);
  }
}

export function createGuard(target: Window, onBack: BackHandler): BackGuard {
  const runtimeTarget = target as RuntimeWindow;
  return (runtimeTarget[RUNTIME_SYMBOL] ||= new WindowCoordinator(
    createHistoryPort(target),
  )).add(onBack);
}
