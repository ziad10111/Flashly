import designTokens from "./design-tokens.json";

export const colors = designTokens.colors;

export const colorSections = [
  {
    title: "Primary",
    tokens: [
      { label: "Flashly Purple", value: colors.primary.purple, tailwindKey: "brand-purple" },
      { label: "Flashly Deep Purple", value: colors.primary.deepPurple, tailwindKey: "brand-deep-purple" },
      { label: "Flashly Blue", value: colors.primary.blue, tailwindKey: "brand-blue" },
      { label: "Flashly Green", value: colors.primary.green, tailwindKey: "brand-green" },
    ],
  },
  {
    title: "Semantic",
    tokens: [
      { label: "Success", value: colors.semantic.success, tailwindKey: "success" },
      { label: "Warning", value: colors.semantic.warning, tailwindKey: "warning" },
      { label: "Streak", value: colors.semantic.streak, tailwindKey: "streak" },
      { label: "Error", value: colors.semantic.error, tailwindKey: "error" },
      { label: "Info", value: colors.semantic.info, tailwindKey: "info" },
    ],
  },
  {
    title: "Neutrals",
    tokens: [
      { label: "Text / Primary", value: colors.neutral.textPrimary, tailwindKey: "ink" },
      { label: "Text / Secondary", value: colors.neutral.textSecondary, tailwindKey: "muted" },
      { label: "Border", value: colors.neutral.border, tailwindKey: "border" },
      { label: "Surface", value: colors.neutral.surface, tailwindKey: "surface" },
      { label: "Background", value: colors.neutral.background, tailwindKey: "background" },
    ],
  },
] as const;
