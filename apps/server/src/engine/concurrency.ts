export type Limiter = <T>(task: () => Promise<T>) => Promise<T>;

/**
 * Minimal dependency-free concurrency limiter — caps simultaneous in-flight checks at `max`
 * (PLAN §3.4). Excess tasks queue and start as slots free up.
 */
export function createLimiter(max: number): Limiter {
  let active = 0;
  const queue: Array<() => void> = [];

  const release = (): void => {
    active -= 1;
    const next = queue.shift();
    if (next) next();
  };

  return <T>(task: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const run = (): void => {
        active += 1;
        task().then(resolve, reject).finally(release);
      };
      if (active < max) run();
      else queue.push(run);
    });
}
