export type BackAttemptSource = "history" | "cascade";

export type BackGuardStatus = "armed" | "triggered" | "disposed";

export interface BackAttempt {
  readonly source: BackAttemptSource;
  leave(): boolean;
  reset(): boolean;
}

export interface BackGuardOptions {
  onBack(attempt: BackAttempt): void | Promise<void>;
  onError?(error: unknown): void;
}

export interface BackGuard {
  readonly status: BackGuardStatus;
  dispose(): void;
}
