import type { Router } from "vue-router";

export type Pop = {
  delta: number;
  from: string;
  to: string;
};

export type Before = (
  to: string,
  from: string,
) => boolean | void | PromiseLike<boolean | void>;

export interface Adapter {
  after(listener: (to: string, from: string) => void): () => void;
  before(listener: Before): () => void;
  listen(listener: (pop: Pop) => void): () => void;
  place(): string;
  wait(place: string): Promise<void>;
}

type Candidate = {
  afterEach?: unknown;
  beforeEach?: unknown;
  options?: {
    history?: {
      listen?: unknown;
    };
  };
};

export function valid(value: unknown): value is Router {
  if (value === null || typeof value !== "object") return false;
  const router = value as Candidate;
  return (
    typeof router.afterEach === "function" &&
    typeof router.beforeEach === "function" &&
    typeof router.options?.history?.listen === "function"
  );
}

export function adapt(router: Router): Adapter {
  const history = router.options.history;
  const place = (): string => {
    const position = history.state.position;
    return typeof position === "number"
      ? `position:${String(position)}`
      : `location:${history.location}`;
  };

  return {
    after(listener): () => void {
      return router.afterEach((to, from) => {
        listener(to.fullPath, from.fullPath);
      });
    },
    before(listener): () => void {
      return router.beforeEach((to, from) =>
        listener(to.fullPath, from.fullPath),
      );
    },
    listen(listener): () => void {
      return history.listen((to, from, information) => {
        if (information.type !== "pop" || information.delta === 0) return;
        listener({ delta: information.delta, from, to });
      });
    },
    place,
    wait(previous): Promise<void> {
      return new Promise((resolve) => {
        let remaining = 20;
        const check = (): void => {
          if (place() !== previous || remaining === 0) {
            resolve();
            return;
          }
          remaining -= 1;
          setTimeout(check, 50);
        };
        check();
      });
    },
  };
}
