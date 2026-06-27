import { useAuth } from "@clerk/expo";
import { Image } from "expo-image";
import { Link, Redirect } from "expo-router";
import { Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";

import { FLASHLY_AUTH_MODE } from "@/api/config";
import { ROUTES } from "@/lib/navigation/routes";

type OverlayCardProps = {
  title: string;
  body: string;
  accent: string;
  background: string;
  icon: string;
  className: string;
  titleClassName?: string;
};

function OverlayCard({
  title,
  body,
  accent,
  background,
  icon,
  className,
  titleClassName = "",
}: OverlayCardProps) {
  return (
    <View
      className={`absolute rounded-[28px] px-5 py-5 shadow-card ${className}`}
      style={{ backgroundColor: background }}
    >
      <View className="flex-row items-center gap-3">
        <View
          className="h-12 w-12 items-center justify-center rounded-full"
          style={{ backgroundColor: accent }}
        >
          <Text
            selectable
            className="font-poppins-semibold text-[26px] leading-[26px] text-white"
          >
            {icon}
          </Text>
        </View>
        <Text
          selectable
          className={`font-poppins-semibold text-[18px] leading-[24px] ${titleClassName}`}
          style={{ color: accent }}
        >
          {title}
        </Text>
      </View>

      <Text selectable className="mt-4 text-[16px] leading-[24px] text-ink">
        {body}
      </Text>
    </View>
  );
}

function DecorativeSpark({
  className,
  color,
  symbol,
}: {
  className: string;
  color: string;
  symbol: string;
}) {
  return (
    <View className={`absolute ${className}`}>
      <Text selectable style={{ color, fontSize: 34, lineHeight: 34 }}>
        {symbol}
      </Text>
    </View>
  );
}

export default function OnboardingScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const { width } = useWindowDimensions();
  const heroWidth = Math.min(width - 48, 460);
  const illustrationSize = Math.min(width * 0.82, 380);

  if (FLASHLY_AUTH_MODE === "mock") {
    return <Redirect href={ROUTES.home as never} />;
  }

  if (!isLoaded) {
    return null;
  }

  if (isSignedIn) {
    return <Redirect href={ROUTES.home as never} />;
  }

  return (
    <ScrollView
      className="bg-lingua-background"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        flexGrow: 1,
        paddingHorizontal: 14,
        paddingVertical: 16,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View className="flex-1 rounded-[38px] bg-white px-6 pb-8 pt-10 shadow-card">
        <View className="items-center">
          <View className="flex-row items-center gap-3">
            <Image
              source={require("../../assets/images/moscot-logo.png")}
              style={{ width: 62, height: 62 }}
              contentFit="contain"
            />
            <Text
              selectable
              className="font-poppins-bold text-[38px] leading-[42px] text-ink"
            >
              Flashly
            </Text>
          </View>

          <Text
            selectable
            className="mt-9 max-w-[760px] text-center font-poppins-bold text-[52px] leading-[62px] tracking-[-1.5px] text-ink"
            style={{ width: heroWidth }}
          >
            Turn your notes{"\n"}into{" "}
            <Text className="text-lingua-purple">smart flashcards.</Text>
          </Text>

          <Text
            selectable
            className="mt-6 max-w-[700px] text-center font-poppins text-[17px] leading-[30px] text-muted"
            style={{ width: Math.min(width - 82, 360) }}
          >
            Upload PDFs, slides, or class notes{"\n"}and study faster with AI-made
            cards.
          </Text>
        </View>

        <View className="relative mt-8 items-center justify-center pb-3 pt-3">
          <OverlayCard
            title="Definition"
            body="Photosynthesis is the process by which plants make food..."
            accent="#5B3BF6"
            background="#FBFAFF"
            icon={"\u25E7"}
            className="left-0 top-4 w-[145px] -rotate-[6deg] border border-[#EEE8FF]"
          />

          <OverlayCard
            title="Question"
            body="What is the main function of the mitochondria?"
            accent="#F0A41A"
            background="#FFFBF1"
            icon="?"
            className="right-0 top-0 w-[170px]"
          />

          <View className="absolute left-[122px] top-[110px]">
            <Text selectable className="text-[54px] text-[#A085FF]">
              {"\u21B6"}
            </Text>
          </View>

          <View className="absolute right-[42px] top-[266px]">
            <Text selectable className="text-[44px] text-[#F6DB7E]">
              {"\u2197"}
            </Text>
          </View>

          <DecorativeSpark
            className="left-[20px] top-[322px]"
            color="#FFC93C"
            symbol={"\u2726"}
          />
          <DecorativeSpark
            className="right-[40px] top-[334px]"
            color="#A98FFF"
            symbol={"\u2726"}
          />

          <View
            className="items-center justify-center"
            style={{ width: illustrationSize + 48, height: illustrationSize + 150 }}
          >
            <Image
              source={require("../../assets/images/mascot-welcome.png")}
              style={{ width: illustrationSize, height: illustrationSize }}
              contentFit="contain"
            />
          </View>

          <OverlayCard
            title="Answer"
            body="To produce energy for the cell in the form of ATP."
            accent="#36B38A"
            background="#F1FFFB"
            icon={"\u2713"}
            className="bottom-[40px] right-[4px] w-[176px]"
          />
        </View>

        <Link href={ROUTES.signUp} asChild>
          <Pressable className="mt-2 flex-row items-center justify-center rounded-[32px] bg-lingua-purple px-8 py-7 shadow-card">
            <Text
              selectable
              className="font-poppins-semibold text-[26px] leading-[32px] text-white"
            >
              Get Started
            </Text>
            <Text
              selectable
              className="ml-6 font-poppins-medium text-[48px] leading-[42px] text-white"
            >
              {"\u2192"}
            </Text>
          </Pressable>
        </Link>
      </View>
    </ScrollView>
  );
}
