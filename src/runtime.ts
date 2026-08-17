import {
  createHistoryPort,
  type HistoryPort,
  type HistorySentinel,
} from "./history";
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
type Armed = {
  phase: "armed";
  sentinel: HistorySentinel;
  layers: Layer[];
};
type Traversing = {
  phase: "traversing";
  sentinel: HistorySentinel;
  owner: Layer;
  restart: Layer[];
  next: "restart" | "back";
};
type State = Armed | Traversing;
type RuntimeWindow = Window & { [RUNTIME_SYMBOL]?: WindowCoordinator };
type ErrorReporter = (error: unknown) => void;

function createErrorReporter(target: Window): ErrorReporter {
  return (error) => {
    const reportError = target.reportError;
    if (typeof reportError === "function") {
      reportError.call(target, error);
    } else {
      void Promise.resolve().then(() => {
        throw error;
      });
    }
  };
}

function createLayer(onBack: BackHandler): Layer {
  let close!: (outcome: Outcome) => void;
  const closed = new Promise<Outcome>((resolve) => {
    close = resolve;
  });
  return { onBack, closed, close };
}

function waitFor(layer: Layer): Promise<void> {
  return layer.closed.then((outcome) => {
    if (outcome !== CLOSED) throw outcome.error;
  });
}

export class WindowCoordinator {
  private state?: State;

  constructor(
    private readonly history: HistoryPort,
    private readonly reportError: ErrorReporter,
  ) {
    history.listenToPopState((intercept) => this.onPopState(intercept));
  }

  add(onBack: BackHandler): BackGuard {
    const layer = createLayer(onBack);
    const state = this.state;

    if (!state) {
      this.arm([layer]);
    } else if (state.phase === "armed") {
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

  private arm(layers: Layer[]): void {
    this.state = {
      phase: "armed",
      sentinel: this.history.createSentinel(),
      layers,
    };
  }

  private top(layers: Layer[]): Layer | undefined {
    return layers[layers.length - 1];
  }

  private onPopState(intercept: () => void): void {
    const state = this.state;
    if (!state) return;
    const armed = state.phase === "armed";
    const layers = armed ? state.layers : [state.owner, ...state.restart];
    if (!state.sentinel.isAtBase()) {
      this.fail(
        layers,
        new Error(
          armed
            ? "@revfanc/guard: back navigation missed the guarded base."
            : "@revfanc/guard: sentinel cleanup missed its base.",
        ),
      );
      return;
    }

    intercept();
    if (armed) {
      try {
        state.sentinel.restoreAtBase();
      } catch (error) {
        this.fail(state.layers, error);
        return;
      }
      const layer = this.top(state.layers);
      if (layer && !layer.attempt) this.dispatch(layer);
      return;
    }

    this.close(state.owner, CLOSED);
    if (state.next === "back") {
      this.state = undefined;
      try {
        this.history.back();
      } catch (error) {
        this.reportError(error);
      }
    } else if (state.restart.length === 0) {
      this.state = undefined;
    } else {
      try {
        this.arm(state.restart);
      } catch (error) {
        this.fail(state.restart, error);
      }
    }
  }

  private dispatch(layer: Layer): void {
    const attempt: BackAttempt = {
      allow: () => this.allow(layer, attempt),
    };
    const finish = (): void => {
      if (layer.attempt === attempt) layer.attempt = undefined;
    };
    const fail = (error: unknown): void => {
      finish();
      this.reportError(error);
    };
    layer.attempt = attempt;
    try {
      const result = layer.onBack(attempt);
      if (result && typeof result.then === "function") {
        Promise.resolve(result).then(finish, fail);
      } else {
        finish();
      }
    } catch (error) {
      fail(error);
    }
  }

  private allow(layer: Layer, attempt: BackAttempt): boolean {
    const state = this.state;
    if (
      !state ||
      state.phase !== "armed" ||
      this.top(state.layers) !== layer ||
      layer.attempt !== attempt ||
      !this.owns(state)
    ) {
      return false;
    }

    if (state.layers.length === 1) {
      return this.traverse(state, layer, "back", true);
    }
    state.layers.pop();
    this.close(layer, CLOSED);
    return true;
  }

  private dispose(layer: Layer): Promise<void> {
    if (layer.outcome) return waitFor(layer);
    const state = this.state;

    if (state?.phase === "traversing") {
      if (state.owner === layer) return waitFor(layer);
      const index = state.restart.indexOf(layer);
      if (index >= 0) {
        state.restart.splice(index, 1);
        this.close(layer, CLOSED);
        return waitFor(layer);
      }
    } else if (state?.phase === "armed") {
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

        this.traverse(state, layer, "restart", false);
        return waitFor(layer);
      }
    }

    const error = new Error("@revfanc/guard: the guard is no longer active.");
    this.close(layer, { error });
    return waitFor(layer);
  }

  private traverse(
    state: Armed,
    layer: Layer,
    next: Traversing["next"],
    reportFailure: boolean,
  ): boolean {
    this.state = {
      phase: "traversing",
      sentinel: state.sentinel,
      owner: layer,
      restart: [],
      next,
    };
    try {
      state.sentinel.releaseToBase();
    } catch (error) {
      this.fail(state.layers, error, false);
      if (reportFailure) this.reportError(error);
      return false;
    }

    layer.attempt = undefined;
    return true;
  }

  private owns(state: Armed): boolean {
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
    this.state = undefined;
    if (report) this.reportError(error);
  }
}

export function createGuard(target: Window, onBack: BackHandler): BackGuard {
  const runtimeTarget = target as RuntimeWindow;
  return (runtimeTarget[RUNTIME_SYMBOL] ||= new WindowCoordinator(
    createHistoryPort(target),
    createErrorReporter(target),
  )).add(onBack);
}
