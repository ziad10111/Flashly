import { useClerk } from "@clerk/expo";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { images } from "@/constants/images";
import { FLASHLY_AUTH_MODE } from "@/api/config";
import { popularStudyTypes } from "@/data/studyTypes";
import { useStudySelectionStore } from "@/store/useStudySelectionStore";
import type { StudyType } from "@/types/study";

type IconPalette = {
  backgroundColor: string;
  accentColor: string;
  label: string;
  labelSize?: number;
};

const iconPalettes: Record<string, IconPalette> = {
  pdf: {
    backgroundColor: "#FFF1F1",
    accentColor: "#FF4D4F",
    label: "PDF",
    labelSize: 16,
  },
  slides: {
    backgroundColor: "#FFF5E9",
    accentColor: "#FF9A36",
    label: "\u25F4",
    labelSize: 26,
  },
  notes: {
    backgroundColor: "#EEF4FF",
    accentColor: "#4D8BFF",
    label: "\u2261",
    labelSize: 26,
  },
  book: {
    backgroundColor: "#ECFFF5",
    accentColor: "#21C16B",
    label: "\u25AD",
    labelSize: 24,
  },
  "scan-pen": {
    backgroundColor: "#F5EEFF",
    accentColor: "#9A6CFF",
    label: "\u270E",
    labelSize: 24,
  },
  target: {
    backgroundColor: "#FFF0F8",
    accentColor: "#F45AC0",
    label: "\u25CE",
    labelSize: 24,
  },
};

function MaterialIcon({ icon }: { icon: StudyType["icon"] }) {
  const palette = iconPalettes[icon] ?? iconPalettes.notes;

  return (
    <View
      className="h-14 w-14 items-center justify-center rounded-[18px]"
      style={{ backgroundColor: palette.backgroundColor }}
    >
      <Text
        selectable
        className="font-poppins-bold"
        style={{ color: palette.accentColor, fontSize: palette.labelSize ?? 24, lineHeight: 26 }}
      >
        {palette.label}
      </Text>
    </View>
  );
}

function SearchIcon() {
  return (
    <View className="mr-4 h-6 w-6 items-center justify-center rounded-full border-2 border-[#7A82AA]">
      <View className="absolute bottom-[-5px] right-[-3px] h-2.5 w-[2px] rotate-[-45deg] rounded-full bg-[#7A82AA]" />
    </View>
  );
}

function Chevron({ selected }: { selected: boolean }) {
  return (
    <Text
      selectable
      className="font-poppins-semibold"
      style={{
        color: selected ? "#FFFFFF" : "#596386",
        fontSize: selected ? 22 : 28,
        lineHeight: selected ? 22 : 26,
      }}
    >
      {selected ? "\u2713" : "\u203A"}
    </Text>
  );
}

export default function StudyTypeScreen() {
  const { signOut } = useClerk();
  const setSelectedStudyType = useStudySelectionStore((state) => state.setSelectedStudyType);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(popularStudyTypes[0]?.id ?? "");
  const trimmedQuery = query.trim().toLowerCase();
  const filteredStudyTypes = !trimmedQuery
    ? popularStudyTypes
    : popularStudyTypes.filter((studyType) => {
        const haystack = `${studyType.title} ${studyType.description}`.toLowerCase();
        return haystack.includes(trimmedQuery);
      });
  const handleBackPress = async () => {
    if (FLASHLY_AUTH_MODE === "clerk") {
      await signOut();
    }

    router.replace("/sign-in");
  };
  const handleContinuePress = () => {
    const selectedStudyType =
      popularStudyTypes.find((studyType) => studyType.id === selectedId) ?? null;

    if (!selectedStudyType) {
      return;
    }

    setSelectedStudyType(selectedStudyType);
    router.push("/upload" as never);
  };

  return (
    <ScrollView
      className="bg-lingua-background"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        flexGrow: 1,
        paddingHorizontal: 18,
        paddingTop: 14,
        paddingBottom: 28,
      }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View className="flex-1 rounded-[38px] bg-white px-7 pb-7 pt-4 shadow-card">
        <View className="min-h-[72px] flex-row items-center justify-center">
          <Pressable
            className="absolute left-0 h-14 w-14 items-start justify-center rounded-full"
            onPress={handleBackPress}
          >
            <Text selectable className="font-poppins text-[44px] leading-[44px] text-ink">
              {"\u2039"}
            </Text>
          </Pressable>

          <Text
            selectable
            className="max-w-[240px] text-center font-poppins-bold text-[28px] leading-[34px] tracking-[-0.6px] text-ink"
          >
            Choose study material
          </Text>
        </View>

        <View className="mt-6 flex-row items-center rounded-[30px] border border-[#E9ECF4] bg-white px-7 py-5 shadow-card">
          <SearchIcon />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search material types"
            placeholderTextColor="#6E769A"
            className="flex-1 font-poppins text-[18px] leading-[24px] text-ink"
          />
        </View>

        <Text selectable className="mt-9 font-poppins-bold text-[20px] leading-[26px] text-ink">
          Popular formats
        </Text>

        <View className="mt-6 gap-4">
          {filteredStudyTypes.map((studyType) => {
            const isSelected = studyType.id === selectedId;

            return (
              <Pressable
                key={studyType.id}
                className="flex-row items-center rounded-[28px] px-5 py-6 shadow-card"
                style={{
                  backgroundColor: isSelected ? "#F7F4FF" : "#FFFFFF",
                  borderColor: isSelected ? "#7A54FF" : "#EEF1F7",
                  borderWidth: 1.5,
                }}
                onPress={() => setSelectedId(studyType.id)}
              >
                <MaterialIcon icon={studyType.icon} />

                <View className="ml-4 flex-1 pr-4">
                  <Text selectable className="font-poppins-bold text-[18px] leading-[24px] text-ink">
                    {studyType.title}
                  </Text>
                  <Text selectable className="mt-1 text-[15px] leading-[23px] text-[#6B7395]">
                    {studyType.description}
                  </Text>
                </View>

                <View
                  className={`items-center justify-center rounded-full ${
                    isSelected ? "h-12 w-12 bg-lingua-purple" : "h-10 w-10"
                  }`}
                >
                  <Chevron selected={isSelected} />
                </View>
              </Pressable>
            );
          })}
        </View>

        {filteredStudyTypes.length === 0 ? (
          <View className="mt-6 rounded-[24px] border border-dashed border-[#DDDFF0] bg-[#FBFBFE] px-5 py-6">
            <Text selectable className="text-center text-[15px] leading-[23px] text-muted">
              No material types match that search yet.
            </Text>
          </View>
        ) : null}

        <Pressable
          className="mt-7 flex-row items-center justify-center rounded-[30px] bg-lingua-purple px-8 py-6 shadow-card"
          onPress={handleContinuePress}
        >
          <Text selectable className="font-poppins-semibold text-[22px] leading-[28px] text-white">
            Continue
          </Text>
          <Text selectable className="ml-6 font-poppins-medium text-[42px] leading-[36px] text-white">
            {"\u2192"}
          </Text>
        </Pressable>

        <View className="mt-7 items-center overflow-hidden rounded-[32px] bg-white pt-2">
          <Image
            source={images.studyMaterialIllustration}
            style={{ width: "100%", aspectRatio: 852 / 461 }}
            contentFit="contain"
          />
        </View>
      </View>
    </ScrollView>
  );
}
