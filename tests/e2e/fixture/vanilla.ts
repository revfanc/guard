import { createBackGuard, type BackAttempt, type BackGuard } from "@guard";

const STATE_KEY = "__revfanc_guard__";

export function mountVanillaFixture(): void {
  const root = document.querySelector<HTMLDivElement>("#app");
  if (!root) {
    return;
  }

  const screen = new URLSearchParams(location.search).get("screen");
  if (screen === "replaced") {
    root.innerHTML = `<main><h1 data-testid="page">Replaced</h1></main>`;
    return;
  }

  history.replaceState({ screen: "origin" }, "", "/?screen=origin");
  root.innerHTML = `
    <main>
      <h1 data-testid="page">Origin</h1>
      <button data-testid="enter">Enter protected page</button>
      <section data-testid="protected-controls" hidden>
        <button data-testid="back">history.back()</button>
        <button data-testid="resolve-attempt">Resolve attempt</button>
        <button data-testid="resolve-back">Resolve, then Back</button>
        <button data-testid="resolve-replace">Resolve, then replace</button>
        <button data-testid="resolve-guard">Resolve guard</button>
        <button data-testid="recreate-a">Resolve and recreate A</button>
        <button data-testid="cycle-a">Cycle A 100 times</button>
        <button data-testid="add-b">Add guard B</button>
        <button data-testid="try-a-action">Try paused A</button>
        <button data-testid="resolve-b">Resolve B</button>
        <button data-testid="resume-a-action">Resume A</button>
        <button data-testid="replace-sentinel">Replace sentinel</button>
      </section>
      <output data-testid="a-attempts">0</output>
      <output data-testid="b-attempts">0</output>
      <output data-testid="popstates">0</output>
      <output data-testid="decision">idle</output>
      <output data-testid="actions">0</output>
      <output data-testid="action-base">none</output>
      <output data-testid="cycles">0</output>
      <output data-testid="cycle-length">0</output>
    </main>`;

  let guardA: BackGuard | undefined;
  let guardB: BackGuard | undefined;
  let attemptA: BackAttempt | undefined;
  let actionCount = 0;

  const query = <T extends HTMLElement>(name: string): T =>
    root.querySelector<T>(`[data-testid="${name}"]`)!;

  const reportError = (error: unknown): void => {
    query("decision").textContent = `error:${String(error)}`;
  };

  const hasMarker = (): boolean => {
    const state: unknown = history.state;
    return (
      state !== null &&
      typeof state === "object" &&
      Object.prototype.hasOwnProperty.call(state, STATE_KEY)
    );
  };

  const recordActionBase = (): void => {
    query("action-base").textContent = `${location.search}:${String(hasMarker())}`;
  };

  const countAction = (): void => {
    actionCount += 1;
    query("actions").textContent = String(actionCount);
  };

  const createA = (): BackGuard =>
    createBackGuard({
      onBack(attempt) {
        attemptA = attempt;
        const count = Number(query("a-attempts").textContent ?? "0") + 1;
        query("a-attempts").textContent = String(count);
      },
      onError: reportError,
    });

  const waitForMarker = async (): Promise<void> => {
    const deadline = performance.now() + 5_000;
    while (performance.now() < deadline) {
      if (hasMarker()) {
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 5));
    }
    throw new Error("sentinel recreation timed out");
  };

  query("enter").addEventListener("click", () => {
    history.pushState({ screen: "protected" }, "", "/?screen=protected");
    query("page").textContent = "Protected";
    query<HTMLButtonElement>("enter").hidden = true;
    query("protected-controls").hidden = false;
    guardA = createA();
  });

  query("back").addEventListener("click", () => {
    window.setTimeout(() => history.back(), 0);
  });

  query("resolve-attempt").addEventListener("click", () => {
    query("decision").textContent =
      `attempt:${String(attemptA?.resolve() ?? false)}`;
  });

  query("resolve-back").addEventListener("click", () => {
    const accepted =
      attemptA?.resolve(() => {
        recordActionBase();
        history.back();
      }) ?? false;
    query("decision").textContent = `back:${String(accepted)}`;
  });

  query("resolve-replace").addEventListener("click", () => {
    const accepted =
      attemptA?.resolve(() => {
        location.replace("/?screen=replaced");
      }) ?? false;
    query("decision").textContent = `replace:${String(accepted)}`;
  });

  query("resolve-guard").addEventListener("click", () => {
    const accepted = guardA?.resolve() ?? false;
    if (accepted) {
      guardA = undefined;
    }
    query("decision").textContent = `guard:${String(accepted)}`;
  });

  query("recreate-a").addEventListener("click", () => {
    const accepted = guardA?.resolve() ?? false;
    if (accepted) {
      guardA = createA();
    }
    query("decision").textContent = `recreate:${String(accepted)}`;
  });

  query("cycle-a").addEventListener("click", () => {
    void (async () => {
      const initialLength = history.length;
      const delay = Number(
        query<HTMLButtonElement>("cycle-a").dataset.delay ?? "0",
      );
      for (let count = 1; count <= 100; count += 1) {
        if (delay > 0 && count > 1) {
          await new Promise((resolve) => window.setTimeout(resolve, delay));
        }
        if (!guardA?.resolve()) {
          throw new Error(`cycle ${count} was rejected`);
        }
        guardA = createA();
        await waitForMarker();
        query("cycles").textContent = String(count);
      }
      query("cycle-length").textContent =
        `${initialLength}:${history.length}`;
      query("decision").textContent = "cycles:done";
    })().catch(reportError);
  });

  query("add-b").addEventListener("click", () => {
    guardB = createBackGuard({
      onBack() {
        const count = Number(query("b-attempts").textContent ?? "0") + 1;
        query("b-attempts").textContent = String(count);
      },
      onError: reportError,
    });
    query("decision").textContent = "b:added";
  });

  query("try-a-action").addEventListener("click", () => {
    const accepted = attemptA?.resolve(countAction) ?? false;
    query("decision").textContent = `a-paused:${String(accepted)}`;
  });

  query("resolve-b").addEventListener("click", () => {
    const accepted = guardB?.resolve() ?? false;
    if (accepted) {
      guardB = undefined;
    }
    query("decision").textContent = `b:${String(accepted)}`;
  });

  query("resume-a-action").addEventListener("click", () => {
    const accepted = attemptA?.resolve(countAction) ?? false;
    query("decision").textContent = `a-resumed:${String(accepted)}`;
  });

  query("replace-sentinel").addEventListener("click", () => {
    history.replaceState(
      { screen: "external", nested: { kept: true } },
      "",
      location.href,
    );
    const accepted = guardA?.resolve(countAction) ?? false;
    query("decision").textContent += `:resolve:${String(accepted)}`;
  });

  addEventListener(
    "popstate",
    () => {
      const count = Number(query("popstates").textContent ?? "0") + 1;
      query("popstates").textContent = String(count);
    },
    true,
  );

  addEventListener("popstate", () => {
    if (new URLSearchParams(location.search).get("screen") === "origin") {
      query("page").textContent = "Origin";
    }
  });
}
