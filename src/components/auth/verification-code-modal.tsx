import { useEffect, useRef } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

type VerificationCodeModalProps = {
  email: string;
  isVisible: boolean;
  code: string;
  errorMessage?: string | null;
  isSubmitting?: boolean;
  onChangeCode: (value: string) => void;
  onResend: () => void;
  onClose: () => void;
};

export function VerificationCodeModal({
  email,
  isVisible,
  code,
  errorMessage,
  isSubmitting = false,
  onChangeCode,
  onResend,
  onClose,
}: VerificationCodeModalProps) {
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!isVisible) {
      return;
    }

    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 120);

    return () => clearTimeout(timer);
  }, [isVisible]);

  return (
    <Modal
      animationType="fade"
      transparent
      visible={isVisible}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 justify-end bg-[#0D132B66]"
      >
        <Pressable className="flex-1" onPress={onClose} />

        <View className="rounded-t-[32px] bg-white px-6 pb-10 pt-7">
          <Text selectable className="font-poppins-bold text-[28px] leading-[34px] text-ink">
            Check your email
          </Text>

          <Text selectable className="mt-3 text-[16px] leading-[28px] text-muted">
            We sent a 6-digit verification code to{" "}
            <Text className="font-poppins-semibold text-ink">
              {email || "your email"}
            </Text>
            . Enter it below to continue.
          </Text>

          <Pressable
            className="mt-8"
            onPress={() => inputRef.current?.focus()}
          >
            <View className="flex-row justify-between gap-3">
              {Array.from({ length: 6 }).map((_, index) => {
                const digit = code[index] ?? "";
                const isActive = index === Math.min(code.length, 5);

                return (
                  <View
                    key={index}
                    className={`h-[62px] flex-1 items-center justify-center rounded-[20px] border ${
                      isActive ? "border-lingua-purple bg-[#F7F4FF]" : "border-border bg-white"
                    }`}
                  >
                    <Text
                      selectable
                      className="font-poppins-semibold text-[24px] leading-[28px] text-ink"
                      style={{ fontVariant: ["tabular-nums"] }}
                    >
                      {digit || ""}
                    </Text>
                  </View>
                );
              })}
            </View>
          </Pressable>

          <TextInput
            ref={inputRef}
            value={code}
            onChangeText={(value) => onChangeCode(value.replace(/[^0-9]/g, "").slice(0, 6))}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            maxLength={6}
            className="absolute h-[1px] w-[1px] opacity-0"
          />

          {errorMessage ? (
            <Text selectable className="mt-5 text-[14px] leading-[22px] text-[#C43D32]">
              {errorMessage}
            </Text>
          ) : null}

          <Pressable className="mt-7 items-center" onPress={onResend} disabled={isSubmitting}>
            <Text
              selectable
              className={`font-poppins-semibold text-[16px] leading-[22px] ${
                isSubmitting ? "text-muted" : "text-lingua-purple"
              }`}
            >
              Resend code
            </Text>
          </Pressable>

          <Pressable
            className="mt-8 items-center justify-center rounded-[28px] border border-border px-5 py-4"
            onPress={onClose}
            disabled={isSubmitting}
          >
            <Text selectable className="font-poppins-semibold text-[16px] leading-[22px] text-ink">
              {isSubmitting ? "Verifying..." : "Close"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
