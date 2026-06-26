const isTimingEnabled = () => process.env.NODE_ENV !== "production";

export function createServerTimingLogger(scope: string) {
  const startedAt = Date.now();
  let previousAt = startedAt;

  return (stage: string, metadata?: Record<string, unknown>) => {
    if (!isTimingEnabled()) {
      return;
    }

    const now = Date.now();

    console.info(`[Flashly timing] ${scope}:${stage}`, {
      deltaMs: now - previousAt,
      elapsedMs: now - startedAt,
      ...metadata,
    });
    previousAt = now;
  };
}
