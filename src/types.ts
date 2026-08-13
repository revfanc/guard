export interface BackAttempt {
  stay(): boolean;
  done(action: () => void | Promise<void>): boolean;
}

export interface BackGuardOptions {
  onBack(attempt: BackAttempt): void | Promise<void>;
  onError?(error: unknown): void;
}

export interface BackGuard {
  dispose(): void;
}
