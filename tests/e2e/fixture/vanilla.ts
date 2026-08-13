import { createBackGuard, type BackAttempt, type BackGuard } from "@guard";

export function mountVanillaFixture(): void {
  const root = document.querySelector<HTMLDivElement>("#app");
  if (!root) return;

  history.replaceState({ origin: true }, "", "/?fixture=vanilla&screen=origin");
  root.innerHTML = `
    <main>
      <h1 data-testid="page">Origin</h1>
      <button data-testid="enter">Enter protected page</button>
      <button data-testid="add-guard" hidden>Add nested guard</button>
      <button data-testid="back" hidden>history.back()</button>
      <button data-testid="leave" hidden>Leave</button>
      <button data-testid="reset" hidden>Reset</button>
      <button data-testid="dispose" hidden>Dispose</button>
      <output data-testid="status">idle</output>
      <output data-testid="attempts">0</output>
      <output data-testid="history-length">${history.length}</output>
    </main>`;

  let guards: BackGuard[] = [];
  const attempts: BackAttempt[] = [];

  const query = <T extends HTMLElement>(name: string) =>
    root.querySelector<T>(`[data-testid="${name}"]`)!;

  const setProtectedControls = (visible: boolean) => {
    for (const name of ["add-guard", "back", "leave", "reset", "dispose"]) {
      query<HTMLButtonElement>(name).hidden = !visible;
    }
  };

  const addGuard = () => {
    const guard = createBackGuard({
      onBack(attempt) {
        attempts.push(attempt);
        query("attempts").textContent = String(attempts.length);
        query("status").textContent = `${attempt.source}:triggered`;
      },
      onError(error) {
        query("status").textContent = `error:${String(error)}`;
      },
    });
    guards.push(guard);
    query("status").textContent = `armed:${guards.length}`;
    query("history-length").textContent = String(history.length);
  };

  query("enter").addEventListener("click", () => {
    history.pushState({ protected: true }, "", "/?fixture=vanilla&screen=protected");
    query("page").textContent = "Protected";
    query<HTMLButtonElement>("enter").hidden = true;
    setProtectedControls(true);
    addGuard();
  });
  query("add-guard").addEventListener("click", addGuard);
  query("back").addEventListener("click", () => history.back());
  query("leave").addEventListener("click", () => {
    const attempt = attempts.at(-1);
    query("status").textContent = `leave:${String(attempt?.leave() ?? false)}`;
    guards = guards.filter((guard) => guard.status !== "disposed");
  });
  query("reset").addEventListener("click", () => {
    const attempt = attempts.at(-1);
    query("status").textContent = `reset:${String(attempt?.reset() ?? false)}`;
  });
  query("dispose").addEventListener("click", () => {
    guards.at(-1)?.dispose();
    guards = guards.filter((guard) => guard.status !== "disposed");
    query("status").textContent = `disposed:${guards.length}`;
  });
  addEventListener("popstate", () => {
    if (new URLSearchParams(location.search).get("screen") === "origin") {
      query("page").textContent = "Origin";
      setProtectedControls(false);
      query<HTMLButtonElement>("enter").hidden = false;
    }
  });
}
