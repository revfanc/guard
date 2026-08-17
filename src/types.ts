export interface BackGuard {
  /** Stops guarding and resolves after any sentinel cleanup completes. */
  dispose(): Promise<void>;
}

export type BackHandler = (
  allow: () => boolean,
) => void | PromiseLike<void>;
