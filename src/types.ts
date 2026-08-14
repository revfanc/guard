export type BackAction = () => void | PromiseLike<unknown>;

export interface BackResolution {
  /** Resolves without scheduling an action. */
  resolve(): boolean;

  /** Resolves and runs the action when the runtime can do so safely. */
  resolve(action: BackAction): boolean;
}

export type BackAttempt = BackResolution;

export type BackGuard = BackResolution;

export interface BackGuardOptions {
  /** Must resolve each attempt explicitly. */
  onBack(attempt: BackAttempt): void | PromiseLike<void>;

  /** Receives callback, action, and internal History API failures. */
  onError?(error: unknown): void;
}
