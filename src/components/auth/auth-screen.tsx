import { Image } from "expo-image";
import { useAuth, useSSO, useSignIn, useSignUp } from "@clerk/expo";
import { makeRedirectUri } from "expo-auth-session";
import { Link, Redirect, router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useEffectEvent, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";

import { VerificationCodeModal } from "@/components/auth/verification-code-modal";
import { FLASHLY_AUTH_MODE } from "@/api/config";
import { safeBack } from "@/lib/navigation/safeBack";
import { useStudySelectionStore } from "@/store/useStudySelectionStore";
import { colors } from "@/theme";

type AuthMode = "sign-up" | "sign-in";

type AuthScreenProps = {
  mode: AuthMode;
};

const socialProviders = [
  {
    id: "oauth_google",
    label: "Continue with Google",
    badge: "G",
    badgeColor: "#EA4335",
  },
  {
    id: "oauth_facebook",
    label: "Continue with Facebook",
    badge: "f",
    badgeColor: "#1877F2",
  },
  {
    id: "oauth_apple",
    label: "Continue with Apple",
    badge: "\uF8FF",
    badgeColor: "#0D132B",
  },
] as const;

WebBrowser.maybeCompleteAuthSession();

type PendingVerification = "sign-up" | "sign-in" | null;

function Sparkle({
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
      <Text selectable style={{ color, fontSize: 30, lineHeight: 30 }}>
        {symbol}
      </Text>
    </View>
  );
}

function SocialButton({
  label,
  badge,
  badgeColor,
  onPress,
  disabled = false,
}: {
  label: string;
  badge: string;
  badgeColor: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      className={`mt-4 flex-row items-center rounded-[24px] border border-[#ECEEF5] bg-white px-7 py-5 shadow-card ${
        disabled ? "opacity-60" : ""
      }`}
      onPress={onPress}
      disabled={disabled}
    >
      <View className="h-12 w-12 items-center justify-center rounded-full bg-[#F8F9FD]">
        <Text
          selectable
          className="font-poppins-semibold text-[30px] leading-[30px]"
          style={{ color: badgeColor }}
        >
          {badge}
        </Text>
      </View>
      <Text selectable className="ml-6 font-poppins-medium text-[18px] leading-[24px] text-ink">
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
  const [email, setEmail] = useState(mode === "sign-up" ? "alex@gmail.com" : "alex@gmail.com");
  const [password, setPassword] = useState("password");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [code, setCode] = useState("");
  const [isVerificationVisible, setIsVerificationVisible] = useState(false);
  const [pendingVerification, setPendingVerification] = useState<PendingVerification>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSocialProvider, setActiveSocialProvider] = useState<string | null>(null);

  const isSignUp = mode === "sign-up";
  const title = isSignUp ? "Create your account" : "Welcome back";
  const primaryLabel = isSignUp ? "Sign Up" : "Sign In";
  const footerPrompt = isSignUp ? "Already have an account?" : "Need an account?";
  const footerAction = isSignUp ? "Log in" : "Sign up";
  const footerHref = isSignUp ? "/sign-in" : "/sign-up";
  const panelWidth = Math.min(width - 28, 520);
  const mascotWidth = Math.min(width * 0.56, 280);
  const ssoRedirectUrl = makeRedirectUri({
    scheme: "ocrapp",
    path: "sso-callback",
  });
  const handleBackPress = () => safeBack("/onboarding");

  const resetVerificationState = () => {
    setCode("");
    setPendingVerification(null);
    setIsVerificationVisible(false);
  };

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

  const handlePrimaryPress = async () => {
    if (!isLoaded) {
      return;
    }

    setErrorMessage(null);
    setCode("");
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
      } else {
        if (!signIn) {
          return;
        }

        const { error: createError } = await signIn.create({
          identifier: email.trim(),
        });

        if (createError) {
          setErrorMessage(formatClerkError(createError));
          return;
        }

        const { error: sendError } = await signIn.emailCode.sendCode();

        if (sendError) {
          setErrorMessage(formatClerkError(sendError));
          return;
        }
      }

      setPendingVerification(mode);
      setIsVerificationVisible(true);
    } catch (error) {
      setErrorMessage(formatClerkError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!isLoaded || code.length !== 6 || !pendingVerification) {
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      if (pendingVerification === "sign-up") {
        if (!signUp) {
          return;
        }

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
        return;
      }

      if (!signIn) {
        return;
      }

      const { error } = await signIn.emailCode.verifyCode({ code });

      if (error) {
        setErrorMessage(formatClerkError(error));
        return;
      }

      if (signIn.status === "complete") {
        await completeSignIn();
        return;
      }

      setErrorMessage("We couldn't finish sign in yet. Please try again.");
    } catch (error) {
      setErrorMessage(formatClerkError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendCode = async () => {
    if (!pendingVerification) {
      return;
    }

    setErrorMessage(null);
    setCode("");
    setIsSubmitting(true);

    try {
      if (pendingVerification === "sign-up") {
        const { error } = await signUp?.verifications.sendEmailCode() ?? {};
        if (error) {
          setErrorMessage(formatClerkError(error));
        }
      } else {
        const { error } = await signIn?.emailCode.sendCode() ?? {};
        if (error) {
          setErrorMessage(formatClerkError(error));
        }
      }
    } catch (error) {
      setErrorMessage(formatClerkError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSocialPress = async (strategy: (typeof socialProviders)[number]["id"]) => {
    setErrorMessage(null);
    setActiveSocialProvider(strategy);

    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy,
        redirectUrl: ssoRedirectUrl,
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
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: "center",
          paddingHorizontal: 14,
          paddingVertical: 16,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View
          className="min-h-full rounded-[38px] bg-white px-7 pb-9 pt-6 shadow-card"
          style={{ width: panelWidth }}
        >
          <Pressable
            className="h-14 w-14 items-start justify-center rounded-full"
            onPress={handleBackPress}
          >
            <Text selectable className="font-poppins text-[44px] leading-[44px] text-ink">
              {"\u2039"}
            </Text>
          </Pressable>

          <Text
            selectable
            className="mt-7 max-w-[320px] font-poppins-bold text-[42px] leading-[50px] tracking-[-1.2px] text-ink"
          >
            {title}
          </Text>

          <Text selectable className="mt-4 text-[18px] leading-[30px] text-muted">
            {isSignUp ? "Start your success journey today " : "Pick up right where you left off "}
            <Text style={{ color: "#FF9D00" }}>✦</Text>
          </Text>

          <View className="relative mt-7 items-center justify-center pb-5 pt-3">
            <Sparkle className="left-[22%] top-[32%]" color="#FF9D00" symbol="✦" />
            <Sparkle className="left-[26%] top-[54%]" color="#FFD84D" symbol="✦" />
            <Sparkle className="right-[21%] top-[40%]" color="#67A9FF" symbol="✦" />
            <Sparkle className="right-[17%] top-[62%]" color="#FFD84D" symbol="✦" />

            <Image
              source={require("../../../assets/images/mascot-auth.png")}
              style={{ width: mascotWidth, height: mascotWidth * 0.9 }}
              contentFit="contain"
            />
          </View>

          <View className="rounded-[28px] border border-[#ECEEF5] bg-white px-6 py-6 shadow-card">
            <Text selectable className="font-poppins text-[18px] leading-[24px] text-[#6A72A4]">
              Email
            </Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Enter your email"
              placeholderTextColor="#9CA3AF"
              className="mt-4 font-poppins-medium text-[22px] leading-[28px] text-ink"
            />
          </View>

          {isSignUp ? (
            <View className="mt-5 rounded-[28px] border border-[#ECEEF5] bg-white px-6 py-6 shadow-card">
              <Text selectable className="font-poppins text-[18px] leading-[24px] text-[#6A72A4]">
                Password
              </Text>

              <View className="mt-4 flex-row items-center justify-between">
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!isPasswordVisible}
                  placeholder="Create a password"
                  placeholderTextColor="#9CA3AF"
                  className="flex-1 font-poppins-medium text-[22px] leading-[28px] text-ink"
                />

                <Pressable
                  className="ml-4 h-12 w-12 items-center justify-center rounded-full"
                  onPress={() => setIsPasswordVisible((current) => !current)}
                >
                  <Text selectable className="font-poppins text-[28px] leading-[28px] text-[#6A72A4]">
                    {isPasswordVisible ? "◉" : "◌"}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <Pressable
            className={`mt-7 items-center justify-center rounded-[28px] bg-lingua-purple px-6 py-6 shadow-card ${
              isSubmitting ? "opacity-70" : ""
            }`}
            onPress={handlePrimaryPress}
            disabled={isSubmitting}
          >
            <Text selectable className="font-poppins-semibold text-[24px] leading-[30px] text-white">
              {primaryLabel}
            </Text>
          </Pressable>

          {errorMessage ? (
            <Text selectable className="mt-4 text-center text-[14px] leading-[22px] text-[#C43D32]">
              {errorMessage}
            </Text>
          ) : null}

          <View className="mt-8 flex-row items-center gap-4">
            <View className="h-px flex-1 bg-[#E9EBF2]" />
            <Text selectable className="font-poppins text-[16px] leading-[24px] text-muted">
              or continue with
            </Text>
            <View className="h-px flex-1 bg-[#E9EBF2]" />
          </View>

          {socialProviders.map((provider) => (
            <SocialButton
              key={provider.id}
              label={provider.label}
              badge={provider.badge}
              badgeColor={provider.badgeColor}
              onPress={() => handleSocialPress(provider.id)}
              disabled={activeSocialProvider !== null}
            />
          ))}

          <View className="mt-9 flex-row items-center justify-center">
            <Text selectable className="text-[16px] leading-[24px] text-muted">
              {footerPrompt}{" "}
            </Text>
            <Link href={footerHref} asChild>
              <Pressable>
                <Text selectable className="font-poppins-semibold text-[16px] leading-[24px] text-lingua-purple">
                  {footerAction}
                </Text>
              </Pressable>
            </Link>
          </View>

          {isSignUp ? <View nativeID="clerk-captcha" className="h-px w-px opacity-0" /> : null}
        </View>
      </ScrollView>

      <VerificationCodeModal
        email={email}
        isVisible={isVerificationVisible}
        code={code}
        errorMessage={errorMessage}
        isSubmitting={isSubmitting}
        onChangeCode={setCode}
        onResend={handleResendCode}
        onClose={() => {
          resetVerificationState();
          setErrorMessage(null);
        }}
      />
    </>
  );
}
