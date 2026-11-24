// A circuit breaker (phase 6d, decision 053).
// Retries handle one failed request. A breaker handles a provider that is
// DOWN: after `failureThreshold` failures in a row it "opens" and fails
// every call at once for `cooldownMs`, without calling the provider. Then it
// lets ONE trial call through ("half-open"): success closes it again, failure
// opens it for another cool-down.
//
//   closed --N failures in a row--> open --cool-down over--> half-open
//     ^                                ^                        |
//     |                                +------ trial fails -----+
//     +------------------------- trial works -------------------+

export type BreakerState = "closed" | "open" | "half-open";

export class CircuitOpenError extends Error {
  constructor() {
    super("Circuit open: not calling the provider for now");
    this.name = "CircuitOpenError";
  }
}

export type BreakerOptions = {
  failureThreshold: number;
  cooldownMs: number;
  // Only failures that say "the provider is in trouble" count. A request the
  // provider refused (e.g. a bad address) means it's up and answering.
  countsAsFailure?: (err: unknown) => boolean;
  onStateChange?: (from: BreakerState, to: BreakerState) => void;
  // Passed in so tests can move time without waiting
  now?: () => number;
};

export class CircuitBreaker {
  private state: BreakerState = "closed";
  private failuresInARow = 0;
  private openedAt = 0;
  // In half-open, only one trial call at a time
  private trialRunning = false;
  private readonly now: () => number;

  constructor(private readonly options: BreakerOptions) {
    this.now = options.now ?? Date.now;
  }

  getState(): BreakerState {
    // An open breaker whose cool-down is over is ready for a trial
    if (
      this.state === "open" &&
      this.now() - this.openedAt >= this.options.cooldownMs
    ) {
      this.moveTo("half-open");
    }
    return this.state;
  }

  async run<T>(call: () => Promise<T>): Promise<T> {
    const state = this.getState();
    if (state === "open") throw new CircuitOpenError();
    if (state === "half-open") {
      if (this.trialRunning) throw new CircuitOpenError();
      this.trialRunning = true;
    }

    try {
      const result = await call();
      this.failuresInARow = 0;
      if (this.state !== "closed") this.moveTo("closed");
      return result;
    } catch (err) {
      const counts = this.options.countsAsFailure?.(err) ?? true;
      if (this.state === "half-open") {
        // The trial failed: back to open for another cool-down. A refused
        // request still proves the provider answers, so that closes it.
        if (counts) this.open();
        else this.moveTo("closed");
      } else if (counts) {
        this.failuresInARow++;
        if (this.failuresInARow >= this.options.failureThreshold) this.open();
      } else {
        // The provider answered, so the run of failures is broken
        this.failuresInARow = 0;
      }
      throw err;
    } finally {
      if (state === "half-open") this.trialRunning = false;
    }
  }

  private open() {
    this.openedAt = this.now();
    this.failuresInARow = 0;
    this.moveTo("open");
  }

  private moveTo(next: BreakerState) {
    const from = this.state;
    if (from === next) return;
    this.state = next;
    this.options.onStateChange?.(from, next);
  }
}
