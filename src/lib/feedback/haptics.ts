import * as Haptics from "expo-haptics";

export const triggerLightHaptic = () => {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
    // Haptics are optional polish and should never block UI.
  });
};

export const triggerSuccessHaptic = () => {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {
    // Haptics are optional polish and should never block UI.
  });
};

export const triggerWarningHaptic = () => {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {
    // Haptics are optional polish and should never block UI.
  });
};
