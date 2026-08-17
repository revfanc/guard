import { createBackGuard, type BackGuard } from "@guard";

const STATE_KEY = "__revfanc_guard__";

export function mountVanillaFixture(): void {
  const root = document.querySelector<HTMLDivElement>("#app");
  if (!root) return;

  const screen = new URLSearchParams(location.search).get("screen");
  if (screen === "replaced") {
    root.innerHTML = `<main><h1 data-testid="page">Replaced</h1></main>`;
    return;
  }

  const protectedAtLoad = screen === "protected";
  if (!protectedAtLoad) {
    history.replaceState({ screen: "origin" }, "", "/?screen=origin");
  }
  root.innerHTML = `
    <main>
      <h1 data-testid="page">${protectedAtLoad ? "Protected" : "Origin"}</h1>
      <button data-testid="enter"${protectedAtLoad ? " hidden" : ""}>Enter protected page</button>
      <section data-testid="protected-controls"${protectedAtLoad ? "" : " hidden"}>
        <button data-testid="back">history.back()</button>
        <button data-testid="deny-attempt">Deny attempt</button>
        <button data-testid="allow-attempt">Allow attempt</button>
        <button data-testid="dispose-replace">Dispose, then replace</button>
        <button data-testid="dispose-guard">Dispose guard</button>
        <button data-testid="recreate-a">Dispose and recreate A</button>
        <button data-testid="cycle-a">Cycle A 100 times</button>
        <button data-testid="add-b">Add guard B</button>
        <button data-testid="try-a-allow">Try paused A</button>
        <button data-testid="allow-b">Allow B</button>
        <button data-testid="dispose-b">Dispose B</button>
        <button data-testid="resume-a-allow">Resume A</button>
        <button data-testid="replace-sentinel">Replace sentinel</button>
      </section>
      <output data-testid="a-attempts">0</output>
      <output data-testid="b-attempts">0</output>
      <output data-testid="popstates">0</output>
      <output data-testid="decision">idle</output>
      <output data-testid="cycles">0</output>
      <output data-testid="cycle-length">0</output>
    </main>`;

  let guardA: BackGuard | undefined;
  let guardB: BackGuard | undefined;
  let allowA: (() => boolean) | undefined;
  let allowB: (() => boolean) | undefined;
  let finishA: (() => void) | undefined;
  let finishB: (() => void) | undefined;

  const query = <T extends HTMLElement>(name: string): T =>
    root.querySelector<T>(`[data-testid="${name}"]`)!;

  const reportError = (error: unknown): void => {
    query("decision").textContent = `error:${String(error)}`;
  };
  Object.defineProperty(window, "reportError", {
    configurable: true,
    value: reportError,
  });

  const hasMarker = (): boolean => {
    const state: unknown = history.state;
    return (
      state !== null &&
      typeof state === "object" &&
      Object.prototype.hasOwnProperty.call(state, STATE_KEY)
    );
  };

  const createA = (): BackGuard =>
    createBackGuard((allow) => {
      allowA = allow;
      const count = Number(query("a-attempts").textContent ?? "0") + 1;
      query("a-attempts").textContent = String(count);
      return new Promise<void>((resolve) => {
        finishA = resolve;
      });
    });

  const waitForMarker = async (): Promise<void> => {
    const deadline = performance.now() + 5_000;
    while (performance.now() < deadline) {
      if (hasMarker()) return;
      await new Promise((resolve) => window.setTimeout(resolve, 5));
    }
    throw new Error("sentinel recreation timed out");
  };

  const finishAttemptA = (): void => {
    finishA?.();
    finishA = undefined;
    allowA = undefined;
  };

  const finishAttemptB = (): void => {
    finishB?.();
    finishB = undefined;
    allowB = undefined;
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

  query("deny-attempt").addEventListener("click", () => {
    finishAttemptA();
    query("decision").textContent = "attempt:denied";
  });

  query("allow-attempt").addEventListener("click", () => {
    const accepted = allowA?.() ?? false;
    finishAttemptA();
    query("decision").textContent = `attempt:${String(accepted)}`;
  });

  query("dispose-replace").addEventListener("click", () => {
    const current = guardA;
    guardA = undefined;
    void current
      ?.dispose()
      .then(() => location.replace("/?screen=replaced"))
      .catch(reportError);
  });

  query("dispose-guard").addEventListener("click", () => {
    const current = guardA;
    guardA = undefined;
    void current
      ?.dispose()
      .then(() => {
        query("decision").textContent = "guard:disposed";
      })
      .catch(reportError);
  });

  query("recreate-a").addEventListener("click", () => {
    const current = guardA;
    if (!current) return;
    const disposal = current.dispose();
    guardA = createA();
    void disposal
      .then(waitForMarker)
      .then(() => {
        query("decision").textContent = "recreate:done";
      })
      .catch(reportError);
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
        if (!guardA) throw new Error(`cycle ${count} lost its guard`);
        const disposal = guardA.dispose();
        guardA = createA();
        await disposal;
        await waitForMarker();
        query("cycles").textContent = String(count);
      }
      query("cycle-length").textContent =
        `${initialLength}:${history.length}`;
      query("decision").textContent = "cycles:done";
    })().catch(reportError);
  });

  query("add-b").addEventListener("click", () => {
    guardB = createBackGuard((allow) => {
      allowB = allow;
      const count = Number(query("b-attempts").textContent ?? "0") + 1;
      query("b-attempts").textContent = String(count);
      return new Promise<void>((resolve) => {
        finishB = resolve;
      });
    });
    query("decision").textContent = "b:added";
  });

  query("try-a-allow").addEventListener("click", () => {
    query("decision").textContent =
      `a-paused:${String(allowA?.() ?? false)}`;
  });

  query("allow-b").addEventListener("click", () => {
    const accepted = allowB?.() ?? false;
    finishAttemptB();
    guardB = undefined;
    query("decision").textContent = `b-allowed:${String(accepted)}`;
  });

  query("dispose-b").addEventListener("click", () => {
    const current = guardB;
    guardB = undefined;
    finishAttemptB();
    void current
      ?.dispose()
      .then(() => {
        query("decision").textContent = "b:disposed";
      })
      .catch(reportError);
  });

  query("resume-a-allow").addEventListener("click", () => {
    const accepted = allowA?.() ?? false;
    finishAttemptA();
    query("decision").textContent = `a-resumed:${String(accepted)}`;
  });

  query("replace-sentinel").addEventListener("click", () => {
    history.replaceState(
      { screen: "external", nested: { kept: true } },
      "",
      location.href,
    );
    const current = guardA;
    guardA = undefined;
    void current
      ?.dispose()
      .then(() => {
        query("decision").textContent = "dispose:true";
      })
      .catch((error) => {
        query("decision").textContent = `dispose:false:${String(error)}`;
      });
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

  if (protectedAtLoad) guardA = createA();
}
