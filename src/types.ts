export interface Guard {
  install(
    app: import("vue", { with: { "resolution-mode": "import" } }).App,
  ): void;
}

export type Handler = (allow: () => void) => void | PromiseLike<void>;
