import { useFonts } from "expo-font";

export const fontFamily = {
  regular: "Poppins-Regular",
  medium: "Poppins-Medium",
  semiBold: "Poppins-SemiBold",
  bold: "Poppins-Bold",
} as const;

export function useAppFonts() {
  return useFonts({
    [fontFamily.regular]: require("../../assets/fonts/Poppins-Regular.ttf"),
    [fontFamily.medium]: require("../../assets/fonts/Poppins-Medium.ttf"),
    [fontFamily.semiBold]: require("../../assets/fonts/Poppins-SemiBold.ttf"),
    [fontFamily.bold]: require("../../assets/fonts/Poppins-Bold.ttf"),
  });
}
