import { USE_BACKEND_API } from "@/api/config";

const shouldLogFallback = typeof __DEV__ !== "undefined" && __DEV__;

export const withBackendFallback = async <TResult>({
  backend,
  fallback,
  label,
}: {
  backend: () => Promise<TResult>;
  fallback: () => Promise<TResult>;
  label: string;
}): Promise<TResult> => {
  if (!USE_BACKEND_API) {
    return fallback();
  }

  try {
    return await backend();
  } catch (error) {
    if (shouldLogFallback) {
      console.warn(`[Flashly API] Falling back to local mock data for ${label}.`, error);
    }

    return fallback();
  }
};
