const designTokens = require("./src/theme/design-tokens.json");

const { colors, typography, radii, spacing } = designTokens;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        brand: {
          purple: colors.primary.purple,
          "deep-purple": colors.primary.deepPurple,
          blue: colors.primary.blue,
          green: colors.primary.green,
        },
        lingua: {
          purple: colors.primary.purple,
          "deep-purple": colors.primary.deepPurple,
          blue: colors.primary.blue,
          green: colors.primary.green,
        },
        success: colors.semantic.success,
        warning: colors.semantic.warning,
        streak: colors.semantic.streak,
        error: colors.semantic.error,
        info: colors.semantic.info,
        ink: colors.neutral.textPrimary,
        muted: colors.neutral.textSecondary,
        border: colors.neutral.border,
        surface: colors.neutral.surface,
        background: colors.neutral.background,
      },
      fontFamily: {
        poppins: [typography.fontFamily.regular],
        "poppins-medium": [typography.fontFamily.medium],
        "poppins-semibold": [typography.fontFamily.semiBold],
        "poppins-bold": [typography.fontFamily.bold],
      },
      fontSize: {
        h1: [typography.scale.h1.fontSize, { lineHeight: `${typography.scale.h1.lineHeight}px` }],
        h2: [typography.scale.h2.fontSize, { lineHeight: `${typography.scale.h2.lineHeight}px` }],
        h3: [typography.scale.h3.fontSize, { lineHeight: `${typography.scale.h3.lineHeight}px` }],
        h4: [typography.scale.h4.fontSize, { lineHeight: `${typography.scale.h4.lineHeight}px` }],
        "body-lg": [typography.scale.bodyLg.fontSize, { lineHeight: `${typography.scale.bodyLg.lineHeight}px` }],
        "body-md": [typography.scale.bodyMd.fontSize, { lineHeight: `${typography.scale.bodyMd.lineHeight}px` }],
        "body-sm": [typography.scale.bodySm.fontSize, { lineHeight: `${typography.scale.bodySm.lineHeight}px` }],
        caption: [typography.scale.caption.fontSize, { lineHeight: `${typography.scale.caption.lineHeight}px` }],
      },
      borderRadius: {
        soft: `${radii.sm}px`,
        panel: `${radii.md}px`,
        card: `${radii.lg}px`,
        pill: `${radii.xl}px`,
      },
      spacing: Object.fromEntries(
        Object.entries(spacing).map(([key, value]) => [key, `${value}px`]),
      ),
      boxShadow: {
        card: "0px 8px 18px rgba(16, 24, 64, 0.05)",
      },
    },
  },
  plugins: [],
};
