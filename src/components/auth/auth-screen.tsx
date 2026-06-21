import { useAuth, useSSO, useSignIn, useSignUp } from "@clerk/expo";
import { Image } from "expo-image";
import { makeRedirectUri } from "expo-auth-session";
import { Link, Redirect, router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useEffectEvent, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from "react-native";

import { FLASHLY_AUTH_MODE } from "@/api/config";
import { VerificationCodeModal } from "@/components/auth/verification-code-modal";
import { safeBack } from "@/lib/navigation/safeBack";
import { useStudySelectionStore } from "@/store/useStudySelectionStore";
import { colors } from "@/theme";

type AuthMode = "sign-up" | "sign-in";

type AuthScreenProps = {
  mode: AuthMode;
};

const socialProviders = [
  {
    badge: "G",
    badgeColor: "#EA4335",
    id: "oauth_google",
    label: "Continue with Google",
  },
  {
    badge: "\uF8FF",
    badgeColor: "#0D132B",
    id: "oauth_apple",
    iconSource: require("../../../assets/images/apple-logo.png"),
    label: "Continue with Apple",
  },
] as const;

type PendingVerification = "sign-up" | null;

WebBrowser.maybeCompleteAuthSession();

function SocialButton({
  badge,
  badgeColor,
  disabled = false,
  iconSource,
  label,
  onPress,
}: {
  badge: string;
  badgeColor: string;
  disabled?: boolean;
  iconSource?: number;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      className={`mt-3 flex-row items-center rounded-[18px] border border-[#ECEEF5] bg-white px-4 py-3 shadow-card ${
        disabled ? "opacity-60" : ""
      }`}
      disabled={disabled}
      onPress={onPress}
    >
      <View className="h-10 w-10 items-center justify-center rounded-full bg-[#F8F9FD]">
        {iconSource ? (
          <Image contentFit="contain" source={iconSource} style={{ height: 22, width: 22 }} />
        ) : (
          <Text selectable={false} className="text-[25px] leading-[26px]" style={{ color: badgeColor, fontWeight: "700" }}>
            {badge}
          </Text>
        )}
      </View>
      <Text selectable className="ml-4 font-poppins-medium text-[15px] leading-[21px] text-ink">
        {label}
      </Text>
    </Pressable>
  );
}

export function AuthScreen({ mode }: AuthScreenProps) {
  const { isLoaded, isSignedIn } = useAuth();
  const { signUp } = useSignUp();
  const { signIn } = useSignIn();
  const { startSSOFlow } = useSSO();
  const hasHydrated = useStudySelectionStore((state) => state.hasHydrated);
  const selectedStudyType = useStudySelectionStore((state) => state.selectedStudyType);
  const { width } = useWindowDimensions();
  const [activeSocialProvider, setActiveSocialProvider] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerificationVisible, setIsVerificationVisible] = useState(false);
  const [password, setPassword] = useState("");
  const [pendingVerification, setPendingVerification] = useState<PendingVerification>(null);

  const isSignUp = mode === "sign-up";
  const title = isSignUp ? "Create your Flashly account" : "Welcome to Flashly";
  const primaryLabel = isSignUp ? "Sign Up" : "Sign In";
  const footerPrompt = isSignUp ? "Already have an account?" : "Need an account?";
  const footerAction = isSignUp ? "Log in" : "Sign up";
  const footerHref = isSignUp ? "/sign-in" : "/sign-up";
  const panelWidth = Math.min(width - 24, 500);
  const mascotWidth = Math.min(width * 0.42, 168);
  const ssoRedirectUrl = makeRedirectUri({
    path: "sso-callback",
    scheme: "flashly",
  });

  const formatClerkError = (error: unknown) => {
    if (!error || typeof error !== "object") {
      return "Something went wrong. Please try again.";
    }

    if ("errors" in error && Array.isArray(error.errors) && error.errors.length > 0) {
      const firstError = error.errors[0];
      if (firstError && typeof firstError === "object" && "message" in firstError) {
        return String(firstError.message);
      }
    }

    if ("message" in error && typeof error.message === "string") {
      return error.message;
    }

    return "Something went wrong. Please try again.";
  };

  const completeSignIn = async () => {
    if (!signIn) {
      return;
    }

    await signIn.finalize({
      navigate: ({ session }) => {
        if (session?.currentTask) {
          return;
        }

        router.replace(selectedStudyType ? ("/" as never) : ("/study-type" as never));
      },
    });
  };

  const completeSignUp = async () => {
    if (!signUp) {
      return;
    }

    await signUp.finalize({
      navigate: ({ session }) => {
        if (session?.currentTask) {
          return;
        }

        router.replace(selectedStudyType ? ("/" as never) : ("/study-type" as never));
      },
    });
  };

  const resetVerificationState = () => {
    setCode("");
    setIsVerificationVisible(false);
    setPendingVerification(null);
  };

  const handlePrimaryPress = async () => {
    if (!isLoaded || isSubmitting) {
      return;
    }

    setCode("");
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      if (isSignUp) {
        if (!signUp) {
          return;
        }

        const { error: createError } = await signUp.create({
          emailAddress: email.trim(),
          password,
        });

        if (createError) {
          setErrorMessage(formatClerkError(createError));
          return;
        }

        const { error: sendError } = await signUp.verifications.sendEmailCode();

        if (sendError) {
          setErrorMessage(formatClerkError(sendError));
          return;
        }

        setPendingVerification("sign-up");
        setIsVerificationVisible(true);
        return;
      }

      if (!signIn) {
        return;
      }

      const { error: createError } = await signIn.create({
        identifier: email.trim(),
        password,
      });

      if (createError) {
        setErrorMessage(formatClerkError(createError));
        return;
      }

      if (signIn.status === "complete") {
        await completeSignIn();
        return;
      }

      setErrorMessage("We couldn't finish sign in yet. Please check your credentials and try again.");
    } catch (error) {
      setErrorMessage(formatClerkError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!isLoaded || code.length !== 6 || pendingVerification !== "sign-up" || !signUp) {
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const { error } = await signUp.verifications.verifyEmailCode({ code });

      if (error) {
        setErrorMessage(formatClerkError(error));
        return;
      }

      if (signUp.status === "complete") {
        await completeSignUp();
        return;
      }

      setErrorMessage("We couldn't finish sign up yet. Please try again.");
    } catch (error) {
      setErrorMessage(formatClerkError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendCode = async () => {
    if (pendingVerification !== "sign-up") {
      return;
    }

    setCode("");
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const { error } = (await signUp?.verifications.sendEmailCode()) ?? {};
      if (error) {
        setErrorMessage(formatClerkError(error));
      }
    } catch (error) {
      setErrorMessage(formatClerkError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSocialPress = async (strategy: (typeof socialProviders)[number]["id"]) => {
    setActiveSocialProvider(strategy);
    setErrorMessage(null);

    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        redirectUrl: ssoRedirectUrl,
        strategy,
      });

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        router.replace(selectedStudyType ? ("/" as never) : ("/study-type" as never));
      }
    } catch (error) {
      setErrorMessage(formatClerkError(error));
    } finally {
      setActiveSocialProvider(null);
    }
  };

  const submitVerification = useEffectEvent(() => {
    handleVerifyCode().catch(() => {
      // Errors are surfaced through component state.
    });
  });

  useEffect(() => {
    if (!isVerificationVisible || code.length !== 6 || isSubmitting) {
      return;
    }

    const timer = setTimeout(() => {
      submitVerification();
    }, 120);

    return () => clearTimeout(timer);
  }, [code, isSubmitting, isVerificationVisible, submitVerification]);

  if (FLASHLY_AUTH_MODE === "mock") {
    return <Redirect href={selectedStudyType ? ("/" as never) : ("/study-type" as never)} />;
  }

  if (!isLoaded) {
    return null;
  }

  if (isSignedIn) {
    if (!hasHydrated) {
      return (
        <View className="flex-1 items-center justify-center bg-lingua-background px-6">
          <ActivityIndicator size="large" color={colors.primary.purple} />
        </View>
      );
    }

    return <Redirect href={selectedStudyType ? ("/" as never) : ("/study-type" as never)} />;
  }

  return (
    <>
      <ScrollView
        className="bg-lingua-background"
        contentContainerStyle={{
          alignItems: "center",
          flexGrow: 1,
          paddingHorizontal: 12,
          paddingVertical: 12,
        }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="min-h-full rounded-[28px] bg-white px-5 pb-6 pt-4 shadow-card" style={{ width: panelWidth }}>
          <Pressable className="h-10 w-10 items-start justify-center rounded-full" onPress={() => safeBack("/onboarding")}>
            <Text selectable className="font-poppins text-[34px] leading-[36px] text-ink">
              {"\u2039"}
            </Text>
          </Pressable>

          <View className="items-center">
            <Image
              contentFit="contain"
              source={require("../../../assets/images/mascot-auth.png")}
              style={{ height: mascotWidth * 0.72, width: mascotWidth }}
            />
            <Text selectable className="mt-2 text-center font-poppins-bold text-[27px] leading-[33px] text-ink">
              {title}
            </Text>
            <Text selectable className="mt-1 text-center text-[14px] leading-[20px] text-muted">
              {isSignUp ? "Create cards from any study material." : "Sign in and keep studying."}
            </Text>
          </View>

          <View className="mt-5 rounded-[18px] border border-[#ECEEF5] bg-white px-4 py-3 shadow-card">
            <Text selectable className="font-poppins text-[13px] leading-[18px] text-[#6A72A4]">
              Email
            </Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              className="mt-1 min-h-[36px] py-0 font-poppins-medium text-[17px] leading-[22px] text-ink"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="Enter your email"
              placeholderTextColor="#9CA3AF"
              value={email}
            />
          </View>

          <View className="mt-3 rounded-[18px] border border-[#ECEEF5] bg-white px-4 py-3 shadow-card">
            <Text selectable className="font-poppins text-[13px] leading-[18px] text-[#6A72A4]">
              Password
            </Text>
            <View className="mt-1 flex-row items-center justify-between">
              <TextInput
                className="min-h-[36px] flex-1 py-0 font-poppins-medium text-[17px] leading-[22px] text-ink"
                onChangeText={setPassword}
                placeholder={isSignUp ? "Create a password" : "Enter your password"}
                placeholderTextColor="#9CA3AF"
                secureTextEntry={!isPasswordVisible}
                value={password}
              />
              <Pressable className="ml-3 h-9 w-9 items-center justify-center rounded-full" onPress={() => setIsPasswordVisible((current) => !current)}>
                <Text selectable={false} className="font-poppins text-[21px] leading-[22px] text-[#6A72A4]">
                  {isPasswordVisible ? "\u25C9" : "\u25CB"}
                </Text>
              </Pressable>
            </View>
          </View>

          <Pressable
            className={`mt-5 items-center justify-center rounded-[20px] bg-lingua-purple px-5 py-4 shadow-card ${
              isSubmitting ? "opacity-70" : ""
            }`}
            disabled={isSubmitting}
            onPress={handlePrimaryPress}
          >
            <Text selectable={false} className="font-poppins-semibold text-[18px] leading-[24px] text-white">
              {primaryLabel}
            </Text>
          </Pressable>

          {errorMessage ? (
            <Text selectable className="mt-4 text-center text-[14px] leading-[22px] text-[#C43D32]">
              {errorMessage}
            </Text>
          ) : null}

          <View className="mt-5 flex-row items-center gap-3">
            <View className="h-px flex-1 bg-[#E9EBF2]" />
            <Text selectable className="font-poppins text-[13px] leading-[18px] text-muted">
              or continue with
            </Text>
            <View className="h-px flex-1 bg-[#E9EBF2]" />
          </View>

          {socialProviders.map((provider) => (
            <SocialButton
              key={provider.id}
              badge={provider.badge}
              badgeColor={provider.badgeColor}
              disabled={activeSocialProvider !== null}
              iconSource={"iconSource" in provider ? provider.iconSource : undefined}
              label={provider.label}
              onPress={() => handleSocialPress(provider.id)}
            />
          ))}

          <View className="mt-5 flex-row items-center justify-center">
            <Text selectable className="text-[14px] leading-[20px] text-muted">
              {footerPrompt}{" "}
            </Text>
            <Link href={footerHref} asChild>
              <Pressable>
                <Text selectable className="font-poppins-semibold text-[14px] leading-[20px] text-lingua-purple">
                  {footerAction}
                </Text>
              </Pressable>
            </Link>
          </View>

          {isSignUp ? <View nativeID="clerk-captcha" className="h-px w-px opacity-0" /> : null}
        </View>
      </ScrollView>

      <VerificationCodeModal
        code={code}
        email={email}
        errorMessage={errorMessage}
        isSubmitting={isSubmitting}
        isVisible={isVerificationVisible}
        onChangeCode={setCode}
        onClose={() => {
          resetVerificationState();
          setErrorMessage(null);
        }}
        onResend={handleResendCode}
      />
    </>
  );
}
