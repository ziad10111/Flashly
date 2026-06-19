type XPCelebrationEvent = {
  amount: number;
  id: string;
  source?: "answer" | "session" | "deck" | "streak";
};

type XPCelebrationListener = (event: XPCelebrationEvent) => void;

const listeners = new Set<XPCelebrationListener>();

export const celebrateXp = (amount: number, source?: XPCelebrationEvent["source"]) => {
  if (amount <= 0) {
    return;
  }

  const event: XPCelebrationEvent = {
    amount,
    id: `xp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    source,
  };

  listeners.forEach((listener) => listener(event));
};

export const subscribeToXpCelebrations = (listener: XPCelebrationListener) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

export type { XPCelebrationEvent };
