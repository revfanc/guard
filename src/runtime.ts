import { createHistoryPort, type HistoryPort, type Sentinel } from "./history";
import type {
  BackAction,
  BackAttempt,
  BackGuard,
  BackGuardOptions,
  BackResolution,
} from "./types";

const RUNTIME_SYMBOL = Symbol.for("@revfanc/guard.runtime.v2");
const SENTINEL_REPLACED =
  "@revfanc/guard: the history sentinel was replaced.";
const ACTION_COMMITTED =
  "@revfanc/guard: a navigation action is already being committed.";
const INVALID_RESOLVE =
  "@revfanc/guard: resolve() accepts no arguments or one action function.";

type Result = BackAction | null;
type Layer = {
  options: BackGuardOptions;
  attempt?: BackAttempt;
};
type Anchored = { phase: "anchored"; sentinel: Sentinel; layers: Layer[] };
type Traversing = {
  phase: "traversing";
  sentinel: Sentinel;
  owner: Layer;
  restart: Layer[];
  action: Result;
};
type State = { phase: "idle" } | Anchored | Traversing;
type RuntimeWindow = Window & { [RUNTIME_SYMBOL]?: WindowCoordinator };

function handle(apply: (result: Result) => boolean): BackResolution {
  function resolve(): boolean;
  function resolve(action: BackAction): boolean;
  function resolve(action?: BackAction): boolean {
    if (arguments.length === 0) return apply(null);
    if (arguments.length !== 1 || typeof action !== "function") {
      throw new TypeError(INVALID_RESOLVE);
    }
    return apply(action);
  }
  return { resolve };
}

function invoke(
  operation: () => void | PromiseLike<unknown>,
  fail: (error: unknown) => void,
): void {
  try {
    const result = operation();
    if (result && typeof result.then === "function") {
      Promise.resolve(result).then(undefined, fail);
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

  add(options: BackGuardOptions): BackGuard {
    const layer: Layer = { options };
    const state = this.state;

    if (state.phase === "idle") {
      this.anchor([layer]);
    } else if (state.phase === "anchored") {
      if (!this.owns(state)) {
        throw new Error(SENTINEL_REPLACED);
      }
      state.layers.push(layer);
    } else if (state.action) {
      throw new Error(ACTION_COMMITTED);
    } else {
      state.restart.push(layer);
    }
    return handle((result) => this.resolveGuard(layer, result));
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
        state.restart,
        new Error("@revfanc/guard: sentinel cleanup missed its base."),
        this.top(state.restart) ?? state.owner,
      );
      return;
    }

    intercept();
    if (state.action) {
      this.state = { phase: "idle" };
      this.run(state.owner, state.action);
    } else if (state.restart.length === 0) {
      this.state = { phase: "idle" };
    } else {
      try {
        this.anchor(state.restart);
      } catch (error) {
        this.fail(state.restart, error, this.top(state.restart) ?? state.owner);
      }
    }
  }

  private dispatch(layer: Layer): void {
    const attempt: BackAttempt = handle((result) =>
      this.resolveAttempt(layer, attempt, result),
    );
    layer.attempt = attempt;
    invoke(
      () => layer.options.onBack(attempt),
      (error) => {
        if (layer.attempt === attempt) layer.attempt = undefined;
        this.report(layer, error);
      },
    );
  }

  private resolveAttempt(
    layer: Layer,
    attempt: BackAttempt,
    result: Result,
  ): boolean {
    const state = this.state;
    if (
      state.phase !== "anchored" ||
      this.top(state.layers) !== layer ||
      layer.attempt !== attempt ||
      !this.owns(state, layer)
    ) {
      return false;
    }

    if (!result) {
      layer.attempt = undefined;
      return true;
    }
    return this.finishLayer(state, layer, state.layers.length - 1, result);
  }

  private resolveGuard(layer: Layer, result: Result): boolean {
    const state = this.state;

    if (state.phase === "traversing") {
      const index = state.restart.indexOf(layer);
      if (state.action || result || index < 0) return false;
      layer.attempt = undefined;
      state.restart.splice(index, 1);
      return true;
    }
    if (state.phase !== "anchored") return false;

    const index = state.layers.indexOf(layer);
    if (index < 0 || !this.owns(state, layer)) return false;
    if (result && this.top(state.layers) !== layer) return false;
    return this.finishLayer(state, layer, index, result);
  }

  private finishLayer(
    state: Anchored,
    layer: Layer,
    index: number,
    result: Result,
  ): boolean {
    if (state.layers.length === 1) {
      return this.final(state, layer, result);
    }
    layer.attempt = undefined;
    state.layers.splice(index, 1);
    if (result) this.run(layer, result);
    return true;
  }

  private final(
    state: Anchored,
    layer: Layer,
    result: Result,
  ): boolean {
    this.state = {
      phase: "traversing",
      sentinel: state.sentinel,
      owner: layer,
      restart: [],
      action: result,
    };
    try {
      state.sentinel.release();
    } catch (error) {
      if (state.sentinel.isCurrent()) {
        this.state = state;
        this.report(layer, error);
      } else {
        this.fail(state.layers, error, layer);
      }
      return false;
    }

    layer.attempt = undefined;
    return true;
  }

  private owns(
    state: Anchored,
    reporter: Layer | undefined = this.top(state.layers),
  ): boolean {
    if (state.sentinel.isCurrent()) return true;
    this.fail(state.layers, new Error(SENTINEL_REPLACED), reporter);
    return false;
  }

  private fail(
    layers: Layer[],
    error: unknown,
    reporter: Layer | undefined = this.top(layers),
  ): void {
    for (const layer of layers) layer.attempt = undefined;
    this.state = { phase: "idle" };
    this.report(reporter, error);
  }

  private run(layer: Layer, action: BackAction): void {
    invoke(action, (error) => this.report(layer, error));
  }

  private report(layer: Layer | undefined, error: unknown): void {
    if (!layer?.options.onError) return this.history.report(error);
    try {
      layer.options.onError(error);
    } catch (failure) {
      this.history.report(failure);
    }
  }
}

export function createGuard(target: Window, options: BackGuardOptions): BackGuard {
  const runtimeTarget = target as RuntimeWindow;
  return (runtimeTarget[RUNTIME_SYMBOL] ||= new WindowCoordinator(
    createHistoryPort(target),
  )).add(options);
}
