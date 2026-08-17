export interface BackGuard {
  /** Stops guarding and waits until the owned history entry is released. */
  dispose(): Promise<void>;
}

export type BackHandler = (
  allow: () => boolean,
) => void | PromiseLike<void>;
