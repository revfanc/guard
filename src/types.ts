export interface Guard {
  (): Promise<void>;
}

export type Handler = (allow: () => void) => void | PromiseLike<void>;
