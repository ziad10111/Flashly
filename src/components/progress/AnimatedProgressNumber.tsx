import { useEffect, useRef, useState } from "react";
import { Text, type TextProps } from "react-native";

type AnimatedProgressNumberProps = TextProps & {
  duration?: number;
  value: number;
};

export function AnimatedProgressNumber({
  duration = 420,
  value,
  ...props
}: AnimatedProgressNumberProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const displayValueRef = useRef(value);

  useEffect(() => {
    const startValue = displayValueRef.current;
    const difference = value - startValue;

    if (difference === 0) {
      return;
    }

    const startedAt = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      const nextValue = Math.round(startValue + difference * easedProgress);

      displayValueRef.current = nextValue;
      setDisplayValue(nextValue);

      if (progress >= 1) {
        clearInterval(timer);
      }
    }, 16);

    return () => clearInterval(timer);
  }, [duration, value]);

  return (
    <Text {...props} style={[props.style, { fontVariant: ["tabular-nums"] }]}>
      {displayValue}
    </Text>
  );
}
