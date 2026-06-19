import { Text, View } from "react-native";

type GenerationStatusPillProps = {
  status?: "generating" | "complete" | "partial-error";
};

const getStatusConfig = (status: GenerationStatusPillProps["status"]) => {
  if (status === "generating") {
    return { label: "Generating", tint: "#F3EFFF", color: "#6C4EF5" };
  }

  if (status === "partial-error") {
    return { label: "Partial", tint: "#FFF4EC", color: "#C96A00" };
  }

  if (status === "complete") {
    return { label: "Complete", tint: "#E8FFF2", color: "#158A4B" };
  }

  return { label: "Ready", tint: "#EAF1FF", color: "#2563EB" };
};

export function GenerationStatusPill({ status }: GenerationStatusPillProps) {
  const config = getStatusConfig(status);

  return (
    <View className="self-start rounded-full px-3 py-2" style={{ backgroundColor: config.tint }}>
      <Text selectable={false} className="font-poppins-semibold text-[12px] leading-[16px]" style={{ color: config.color }}>
        {config.label}
      </Text>
    </View>
  );
}
