import type { Adapter, Pop } from "./router";
import type { Handler } from "./types";

type Item = {
  active: boolean;
  handler: Handler;
};

type Attempt = {
  item: Item;
  tail: Promise<void>;
  stop(): void;
};

type Outcome =
  | { type: "done" }
  | { type: "error"; error: unknown }
  | { type: "stop" };

export class Runtime {
  private readonly items: Item[] = [];
  private readonly pops: Pop[] = [];
  private attempt?: Attempt;
  private cleanups?: Array<() => void>;

  constructor(private readonly router: Adapter) {}

  add(handler: Handler): () => void {
    const item: Item = { active: true, handler };
    this.items.push(item);
    this.attach();

    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      this.remove(item);
    };
  }

  private attach(): void {
    if (this.cleanups) return;
    this.cleanups = [
      this.router.listen((pop) => this.pops.push(pop)),
      this.router.before((to, from) => this.before(to, from)),
      this.router.after(() => {
        this.pops.length = 0;
      }),
    ];
  }

  private detach(): void {
    if (this.items.length > 0 || this.attempt || !this.cleanups) return;
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = undefined;
    this.pops.length = 0;
  }

  private take(to: string, from: string): Pop | undefined {
    let index = this.pops.findIndex(
      (pop) => pop.to === to && pop.from === from,
    );
    if (index < 0 && this.attempt) {
      index = this.pops.findIndex((pop) => pop.to === to);
    }
    if (index < 0) return undefined;
    const [pop] = this.pops.splice(index, 1);
    return pop;
  }

  private before(to: string, from: string): Promise<boolean> | undefined {
    const pop = this.take(to, from);
    if (!pop) return undefined;
    if (this.attempt) return this.reject(this.attempt);

    const item = this.items[this.items.length - 1];
    if (!item) {
      this.detach();
      return undefined;
    }
    return this.decide(item);
  }

  private async decide(item: Item): Promise<boolean> {
    let allowed = false;
    let stop!: () => void;
    let settle!: (value: { place: string; rollback: boolean }) => void;
    const stopped = new Promise<Outcome>((resolve) => {
      stop = () => resolve({ type: "stop" });
    });
    const settled = new Promise<{ place: string; rollback: boolean }>(
      (resolve) => {
        settle = resolve;
      },
    );
    const tail = settled.then(async ({ place, rollback }) => {
      if (rollback) await this.router.wait(place);
    });
    const attempt: Attempt = { item, stop, tail };
    this.attempt = attempt;

    const handler = Promise.resolve().then(() =>
      item.handler(() => {
        if (item.active && this.attempt === attempt) allowed = true;
      }),
    );
    const completion = handler.then<Outcome, Outcome>(
      () => ({ type: "done" }),
      (error: unknown) => ({ type: "error", error }),
    );
    const outcome = await Promise.race([completion, stopped]);

    if (this.attempt === attempt) this.attempt = undefined;

    if (outcome.type === "error") {
      settle({ place: this.router.place(), rollback: true });
      this.detach();
      throw outcome.error;
    }
    if (outcome.type === "stop" || !item.active) {
      settle({ place: this.router.place(), rollback: true });
      this.detach();
      return false;
    }
    if (!allowed) {
      settle({ place: this.router.place(), rollback: true });
      this.detach();
      return false;
    }

    this.remove(item);
    const result = this.items.length === 0;
    settle({ place: this.router.place(), rollback: !result });
    return result;
  }

  private reject(attempt: Attempt): Promise<boolean> {
    let place = "";
    const result = attempt.tail.then(() => {
      place = this.router.place();
      return false;
    });
    attempt.tail = result.then(() => this.router.wait(place));
    return result;
  }

  private remove(item: Item): void {
    if (!item.active) return;
    item.active = false;
    const index = this.items.indexOf(item);
    if (index >= 0) this.items.splice(index, 1);
    if (this.attempt?.item === item) this.attempt.stop();
    this.detach();
  }
}
