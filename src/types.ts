export interface BackAttempt {
  /** Allows the current Back request. */
  allow(): boolean;
}

export interface BackGuard {
  /** Stops guarding and resolves after any sentinel cleanup completes. */
  dispose(): Promise<void>;
}

export type BackHandler = (
  attempt: BackAttempt,
) => void | PromiseLike<void>;
