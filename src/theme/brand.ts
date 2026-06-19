import designTokens from "./design-tokens.json";
import { typography } from "./typography";

export const brand = {
  ...designTokens.brand,
  fontFamily: typography.fontFamily.bold,
} as const;
