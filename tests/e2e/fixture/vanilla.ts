import { createBackGuard, type BackAttempt } from "@guard";

export function mountVanillaFixture(): void {
  const root = document.querySelector<HTMLDivElement>("#app");
  if (!root) return;

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
      <button data-testid="back" hidden>history.back()</button>
      <button data-testid="stay" hidden>Stay</button>
      <button data-testid="done-back" hidden>Done, then history.back()</button>
      <button data-testid="done-replace" hidden>Done, then location.replace()</button>
      <button data-testid="add-b" hidden>Add guard B</button>
      <button data-testid="try-a-done" hidden>Try paused A</button>
      <button data-testid="dispose-b" hidden>Dispose B</button>
      <button data-testid="resume-a-done" hidden>Resume A</button>
      <output data-testid="a-attempts">0</output>
      <output data-testid="b-attempts">0</output>
      <output data-testid="back-requests">0</output>
      <output data-testid="decision">idle</output>
      <output data-testid="actions">0</output>
    </main>`;

  let guardA: ReturnType<typeof createBackGuard> | undefined;
  let guardB: ReturnType<typeof createBackGuard> | undefined;
  let attemptA: BackAttempt | undefined;
  let actionCount = 0;

  const query = <T extends HTMLElement>(name: string) =>
    root.querySelector<T>(`[data-testid="${name}"]`)!;

  const showProtectedControls = (): void => {
    query<HTMLButtonElement>("enter").hidden = true;
    for (const name of [
      "back",
      "stay",
      "done-back",
      "done-replace",
      "add-b",
      "try-a-done",
      "dispose-b",
      "resume-a-done",
    ]) {
      query<HTMLButtonElement>(name).hidden = false;
    }
  };

  const reportError = (error: unknown): void => {
    query("decision").textContent = `error:${String(error)}`;
  };

  const updateActionCount = (): void => {
    actionCount += 1;
    query("actions").textContent = String(actionCount);
  };

  query("enter").addEventListener("click", () => {
    history.pushState({ screen: "protected" }, "", "/?screen=protected");
    query("page").textContent = "Protected";
    showProtectedControls();
    guardA = createBackGuard({
      onBack(attempt) {
        attemptA = attempt;
        const count = Number(query("a-attempts").textContent ?? "0") + 1;
        query("a-attempts").textContent = String(count);
      },
      onError: reportError,
    });
  });

  query("back").addEventListener("click", () => {
    const requests = Number(query("back-requests").textContent ?? "0") + 1;
    query("back-requests").textContent = String(requests);
    window.setTimeout(() => history.back(), 0);
  });

  query("stay").addEventListener("click", () => {
    query("decision").textContent = `stay:${String(attemptA?.stay() ?? false)}`;
  });

  query("done-back").addEventListener("click", () => {
    const accepted = attemptA?.done(() => history.back()) ?? false;
    query("decision").textContent = `done-back:${String(accepted)}`;
  });

  query("done-replace").addEventListener("click", () => {
    const accepted = attemptA?.done(() => location.replace("/?screen=replaced")) ?? false;
    query("decision").textContent = `done-replace:${String(accepted)}`;
  });

  query("add-b").addEventListener("click", () => {
    guardB = createBackGuard({
      onBack() {
        const count = Number(query("b-attempts").textContent ?? "0") + 1;
        query("b-attempts").textContent = String(count);
      },
      onError: reportError,
    });
    query("decision").textContent = "b-added";
  });

  query("try-a-done").addEventListener("click", () => {
    const accepted = attemptA?.done(updateActionCount) ?? false;
    query("decision").textContent = `a-paused:${String(accepted)}`;
  });

  query("dispose-b").addEventListener("click", () => {
    guardB?.dispose();
    guardB = undefined;
    query("decision").textContent = "b-disposed";
  });

  query("resume-a-done").addEventListener("click", () => {
    const accepted = attemptA?.done(updateActionCount) ?? false;
    query("decision").textContent = `a-resumed:${String(accepted)}`;
  });

  addEventListener("popstate", () => {
    if (new URLSearchParams(location.search).get("screen") === "origin") {
      query("page").textContent = "Origin";
    }
  });

  addEventListener("pagehide", () => {
    guardB?.dispose();
    guardA?.dispose();
  });
}
