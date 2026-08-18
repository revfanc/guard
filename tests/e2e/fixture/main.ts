import { createGuard, type Guard, type Handler } from "@guard";

const KEY = "__revfanc_guard__";
type Name = "a" | "b";
type Attempt = { allow: () => void; resolve: () => void };

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("fixture root missing");

root.innerHTML = `
  <main>
    <h1 data-testid="page"></h1>
    <button data-testid="enter">Enter protected page</button>
    <section data-testid="controls">
      <button data-testid="back">Back</button>
      <button data-testid="forward">Forward</button>
      <button data-testid="minus-two">go(-2)</button>
      <button data-testid="add-a">Add A</button>
      <button data-testid="add-b">Add B</button>
      <button data-testid="allow-a">Allow A</button>
      <button data-testid="deny-a">Deny A</button>
      <button data-testid="allow-b">Allow B</button>
      <button data-testid="deny-b">Deny B</button>
      <button data-testid="stop-a">Stop A</button>
      <button data-testid="stop-b">Stop B</button>
    </section>
    <output data-testid="a-attempts">0</output>
    <output data-testid="b-attempts">0</output>
    <output data-testid="popstates">0</output>
    <output data-testid="decision">idle</output>
    <div data-testid="frame-host"></div>
  </main>`;

const query = <T extends HTMLElement>(name: string): T =>
  root.querySelector<T>(`[data-testid="${name}"]`)!;
const attempts = new Map<Name, Attempt>();
const stops = new Map<Name, Guard>();

Object.defineProperty(window, "reportError", {
  configurable: true,
  value: (error: unknown) => {
    query("decision").textContent = `error:${String(error)}`;
  },
});

addEventListener(
  "popstate",
  () => {
    query("popstates").textContent = String(
      Number(query("popstates").textContent) + 1,
    );
  },
  true,
);

function screen(): string {
  return new URLSearchParams(location.search).get("screen") ?? "origin";
}

function render(): void {
  const current = screen();
  const protectedPage = current === "protected";
  query("page").textContent = protectedPage
    ? "Protected"
    : current === "origin"
      ? "Origin"
      : current;
  query<HTMLButtonElement>("enter").hidden = current !== "origin";
  query("controls").hidden = !protectedPage;
}

addEventListener("popstate", render);

function handler(name: Name): Handler {
  return (allow) => {
    query(`${name}-attempts`).textContent = String(
      Number(query(`${name}-attempts`).textContent) + 1,
    );
    query("decision").textContent = `${name}:pending`;
    return new Promise<void>((resolve) => {
      attempts.set(name, { allow, resolve });
    });
  };
}

function add(name: Name, target?: Window): void {
  const previous = stops.get(name);
  if (previous) void previous();
  stops.set(name, createGuard(handler(name), target));
  query("decision").textContent = `${name}:added`;
}

function decide(name: Name, allowed: boolean): void {
  const attempt = attempts.get(name);
  if (!attempt) return;
  attempts.delete(name);
  if (allowed) attempt.allow();
  attempt.resolve();
  query("decision").textContent = `${name}:${allowed ? "allowed" : "denied"}`;
}

function stop(name: Name): void {
  const current = stops.get(name);
  stops.delete(name);
  const attempt = attempts.get(name);
  attempts.delete(name);
  attempt?.resolve();
  if (!current) return;
  void current().then(() => {
    query("decision").textContent = `${name}:stopped`;
  });
}

query("enter").addEventListener("click", () => {
  history.pushState({ screen: "protected" }, "", "/?screen=protected");
  render();
  add("a");
});
query("back").addEventListener("click", () => history.back());
query("forward").addEventListener("click", () => history.forward());
query("minus-two").addEventListener("click", () => history.go(-2));
query("add-a").addEventListener("click", () => add("a"));
query("add-b").addEventListener("click", () => add("b"));
query("allow-a").addEventListener("click", () => decide("a", true));
query("deny-a").addEventListener("click", () => decide("a", false));
query("allow-b").addEventListener("click", () => decide("b", true));
query("deny-b").addEventListener("click", () => decide("b", false));
query("stop-a").addEventListener("click", () => stop("a"));
query("stop-b").addEventListener("click", () => stop("b"));

const current = screen();
const state = history.state;
if (state === null || typeof state !== "object") {
  history.replaceState({ screen: current }, "", location.href);
} else if (!(KEY in state)) {
  history.replaceState({ ...state, screen: current }, "", location.href);
}
render();

if (current === "protected") add("a");
if (current === "iframe-self" || current === "iframe-target") {
  query("frame-host").innerHTML = `
    <iframe data-testid="frame" src="/frame.html?mode=${
      current === "iframe-self" ? "self" : "target"
    }"></iframe>`;
  if (current === "iframe-target") {
    query<HTMLIFrameElement>("frame").addEventListener("load", (event) => {
      const frame = (event.currentTarget as HTMLIFrameElement).contentWindow;
      if (frame) add("a", frame);
    });
  }
}
