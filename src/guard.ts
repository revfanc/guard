import type { Guard, Handler } from "./types";

const KEY = "__revfanc_guard__";

type State = null | Record<string, unknown>;
type Status = "stopped" | "guarding" | "cleaning";
type Next = "stay" | "leave";

type Tag = {
  encoded: string;
  nullable: boolean;
};

type Session = {
  close(): void;
  closed: Promise<void>;
  handler: Handler;
};

let sequence = 0;

function plain(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function valid(value: unknown): value is State {
  return value === null || plain(value);
}

function parse(state: State): Tag | undefined {
  if (state === null || !Object.prototype.hasOwnProperty.call(state, KEY)) {
    return undefined;
  }
  const value: unknown = state[KEY];
  if (typeof value !== "string") return undefined;
  const match = /^a:([no]):([a-z0-9-]+)$/.exec(value);
  if (!match?.[2]) return undefined;
  return { encoded: value, nullable: match[1] === "n" };
}

function tag(nullable: boolean): Tag {
  sequence += 1;
  const random = Math.random().toString(36).slice(2) || "0";
  const id = `${Date.now().toString(36)}-${sequence.toString(36)}-${random}`;
  return { encoded: `a:${nullable ? "n" : "o"}:${id}`, nullable };
}

function copy(state: State): Record<string, unknown> {
  const value: Record<string, unknown> = {};
  if (state !== null) {
    for (const key of Object.keys(state)) value[key] = state[key];
  }
  return value;
}

function mark(state: State, current: Tag): Record<string, unknown> {
  if (state !== null && Object.prototype.hasOwnProperty.call(state, KEY)) {
    throw new Error("history entry unavailable");
  }
  const value = copy(state);
  value[KEY] = current.encoded;
  return value;
}

function strip(state: State, current: Tag): State {
  if (state === null || parse(state)?.encoded !== current.encoded) {
    throw new Error("history entry unavailable");
  }
  const value = copy(state);
  delete value[KEY];
  return current.nullable && Object.keys(value).length === 0 ? null : value;
}

function session(handler: Handler): Session {
  let done = false;
  let resolve!: () => void;
  const closed = new Promise<void>((current) => {
    resolve = current;
  });
  return {
    close(): void {
      if (done) return;
      done = true;
      resolve();
    },
    closed,
    handler,
  };
}

function report(target: Window, error: unknown): void {
  if (typeof target.reportError === "function") {
    target.reportError.call(target, error);
  } else {
    target.setTimeout(() => {
      throw error;
    }, 0);
  }
}

export class Controller {
  private current?: Session;
  private listening = false;
  private next?: Next;
  private run?: object;
  private status: Status = "stopped";
  private tag?: Tag;
  private url = "";

  constructor(private readonly target: Window) {}

  start(handler: Handler): Guard {
    const current = session(handler);
    if (this.status === "cleaning") {
      current.close();
      return () => current.closed;
    }

    const previous = this.current;
    this.current = current;
    this.run = undefined;
    previous?.close();

    if (this.status === "stopped") this.arm();
    else if (!this.buffer()) this.reset();

    return () => {
      this.stop(current);
      return current.closed;
    };
  }

  private arm(): void {
    try {
      this.url = this.target.location.href;
      const state: unknown = this.target.history.state;
      if (!valid(state)) throw new Error("history entry unavailable");
      const existing = parse(state);
      if (state !== null && Object.prototype.hasOwnProperty.call(state, KEY)) {
        if (!existing) throw new Error("history entry unavailable");
        this.tag = existing;
      } else {
        this.tag = tag(state === null);
        this.target.history.pushState(
          mark(state, this.tag),
          "",
          this.url,
        );
      }
      this.listen();
      this.status = "guarding";
    } catch {
      this.reset();
    }
  }

  private readonly pop = (event: PopStateEvent): void => {
    if (this.status === "cleaning") {
      this.close(event);
      return;
    }
    if (this.status !== "guarding") return;
    if (this.buffer()) return;
    if (!this.page()) {
      this.reset();
      return;
    }

    try {
      const state: unknown = this.target.history.state;
      if (!valid(state) || !this.tag) throw new Error("history entry unavailable");
      this.target.history.pushState(mark(state, this.tag), "", this.url);
    } catch {
      this.reset();
      return;
    }

    event.stopImmediatePropagation();
    if (!this.run) this.invoke();
  };

  private invoke(): void {
    const current = this.current;
    if (!current) return;
    const run = {};
    this.run = run;
    let active = true;

    const finish = (): void => {
      active = false;
      if (this.run === run) this.run = undefined;
    };
    const fail = (error: unknown): void => {
      finish();
      report(this.target, error);
    };
    const allow = (): void => {
      if (
        !active ||
        this.run !== run ||
        this.current !== current ||
        this.status !== "guarding"
      ) {
        return;
      }
      active = false;
      this.run = undefined;
      this.clean(current, "leave");
    };

    try {
      const result = current.handler(allow);
      if (result && typeof result.then === "function") {
        Promise.resolve(result).then(finish, fail);
      } else {
        finish();
      }
    } catch (error) {
      fail(error);
    }
  }

  private stop(current: Session): void {
    if (this.current !== current) {
      current.close();
      return;
    }
    if (this.status === "cleaning") return;
    if (this.status !== "guarding") {
      this.reset();
      return;
    }
    this.run = undefined;
    this.clean(current, "stay");
  }

  private clean(current: Session, next: Next): void {
    try {
      if (this.current !== current || !this.buffer() || !this.tag) {
        throw new Error("history entry unavailable");
      }
      const state: unknown = this.target.history.state;
      if (!valid(state)) throw new Error("history entry unavailable");
      this.target.history.replaceState(strip(state, this.tag), "", this.url);
      this.status = "cleaning";
      this.next = next;
      this.target.history.back();
    } catch {
      this.reset();
    }
  }

  private close(event: PopStateEvent): void {
    if (!this.page()) {
      this.reset();
      return;
    }
    event.stopImmediatePropagation();
    const next = this.next;
    this.reset();
    if (next === "leave") {
      try {
        this.target.history.back();
      } catch {
        // The guarded traversal has already been released.
      }
    }
  }

  private page(): boolean {
    if (this.target.location.href !== this.url) return false;
    const state: unknown = this.target.history.state;
    return (
      valid(state) &&
      (state === null || !Object.prototype.hasOwnProperty.call(state, KEY))
    );
  }

  private buffer(): boolean {
    if (this.target.location.href !== this.url || !this.tag) return false;
    const state: unknown = this.target.history.state;
    return valid(state) && parse(state)?.encoded === this.tag.encoded;
  }

  private reset(): void {
    const current = this.current;
    this.unlisten();
    this.current = undefined;
    this.next = undefined;
    this.run = undefined;
    this.status = "stopped";
    this.tag = undefined;
    this.url = "";
    current?.close();
  }

  private listen(): void {
    if (this.listening) return;
    this.target.addEventListener("popstate", this.pop, true);
    this.listening = true;
  }

  private unlisten(): void {
    if (!this.listening) return;
    this.target.removeEventListener("popstate", this.pop, true);
    this.listening = false;
  }
}

let owner: Window | undefined;
let controller: Controller | undefined;

export function start(target: Window, handler: Handler): Guard {
  if (!controller || owner !== target) {
    owner = target;
    controller = new Controller(target);
  }
  return controller.start(handler);
}
