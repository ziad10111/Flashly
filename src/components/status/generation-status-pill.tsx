import { Text, View } from "react-native";

type GenerationStatusPillProps = {
  status?:
    | "queued"
    | "processing"
    | "partial"
    | "completed"
    | "failed"
    | "cancelled"
    | "generating"
    | "complete"
    | "partial-error";
};

const getStatusConfig = (status: GenerationStatusPillProps["status"]) => {
  if (status === "queued") {
    return { label: "Queued", tint: "#EAF1FF", color: "#2563EB" };
  }

  if (status === "generating" || status === "processing") {
    return { label: "Generating", tint: "#F3EFFF", color: "#6C4EF5" };
  }

  if (status === "partial" || status === "partial-error") {
    return { label: "Partial", tint: "#FFF4EC", color: "#C96A00" };
  }

  if (status === "failed") {
    return { label: "Failed", tint: "#FFF0F0", color: "#C43D32" };
  }

  if (status === "cancelled") {
    return { label: "Cancelled", tint: "#EEF0F4", color: "#5B6275" };
  }

  if (status === "complete" || status === "completed") {
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
