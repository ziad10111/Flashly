import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";

import { getCardsForDeck, getDeckById } from "@/api/repositories/deckRepository";
import { PressableScale } from "@/components/animated/pressable-scale";
import { AnimatedOwl } from "@/components/mascot/animated-owl";
import { formatPercent } from "@/lib/deck-utils";
import { useActiveDeckStore } from "@/store/useActiveDeckStore";
import { useFlashlyAssistantStore } from "@/store/useFlashlyAssistantStore";
import { useFlashlyProgressStore } from "@/store/useFlashlyProgressStore";
import type { DeckDTO, FlashcardDTO, GetDeckResponse } from "@/api/contracts";

type QuickPrompt = {
  label: string;
  message: string;
};

const quickPrompts: QuickPrompt[] = [
  { label: "Summarize", message: "Summarize this deck" },
  { label: "Quiz me", message: "Quiz me" },
  { label: "Weak cards", message: "Explain weak cards" },
  { label: "Study plan", message: "Create a mini study plan" },
  { label: "Hardest topic", message: "Explain the hardest topic" },
  { label: "Exam tips", message: "Give me exam tips" },
];

type LoadState = "loading" | "ready" | "empty" | "error";

const getTopics = (cards: FlashcardDTO[]) =>
  Array.from(new Set(cards.map((card) => card.topic || card.sourceSection).filter(Boolean))).slice(0, 4);

const getMockAssistantReply = ({
  cards,
  deck,
  message,
  progressPercent,
  weakCardCount,
}: {
  cards: FlashcardDTO[];
  deck: DeckDTO;
  message: string;
  progressPercent: string;
  weakCardCount: number;
}) => {
  const normalized = message.toLowerCase();
  const topics = getTopics(cards);
  const topicText = topics.length > 0 ? topics.join(", ") : "the key ideas in this material";
  const hardestCard = cards.find((card) => card.difficulty === "hard") ?? cards.find((card) => card.difficulty === "medium") ?? cards[0];
  const sampleQuestions = cards.slice(0, 3).map((card, index) => `${index + 1}. ${card.question}`).join("\n");

  if (normalized.includes("summarize")) {
    return `${deck.title} focuses on ${topicText}. You have ${cards.length || deck.cardCount} cards from ${deck.sourceFileName}, and your current progress is ${progressPercent}. A good first pass is to review the definitions, then test yourself on the concept and example cards.`;
  }

  if (normalized.includes("quiz")) {
    return sampleQuestions
      ? `Here are a few quick practice questions from ${deck.title}:\n\n${sampleQuestions}\n\nAnswer them out loud, then open the deck review to check yourself.`
      : `I can quiz you once this deck has cards. For now, open a generated or built-in deck and I will use those cards here.`;
  }

  if (normalized.includes("weak")) {
    return weakCardCount > 0
      ? `${deck.title} has ${weakCardCount} weak ${weakCardCount === 1 ? "card" : "cards"}. Start with those before reviewing the whole deck. Read the explanation, answer once without looking, then mark it again only if it still feels shaky.`
      : `${deck.title} has no weak cards right now. Nice. Keep it that way by doing one short review session and marking any uncertain cards for another pass.`;
  }

  if (normalized.includes("next")) {
    return `Review next: start with ${weakCardCount > 0 ? "weak cards" : "the least familiar topic"}, then do a full pass through ${deck.title}. Your progress is ${progressPercent}, so the next useful goal is 5 focused cards, not a long cram session.`;
  }

  if (normalized.includes("plan")) {
    return `Mini study plan for ${deck.title}:\n\n1. Spend 3 minutes skimming the card topics: ${topicText}.\n2. Review 5 cards and mark uncertain ones.\n3. Revisit weak cards immediately.\n4. Finish with one self-summary from memory.`;
  }

  if (normalized.includes("hardest")) {
    return hardestCard
      ? `The hardest topic looks like ${hardestCard.topic}. Try this card slowly: "${hardestCard.question}"\n\nAnswer: ${hardestCard.answer}\n\nWhy it matters: ${hardestCard.explanation ?? "It connects the detail to the bigger idea in the deck."}`
      : `I do not see hard cards in this deck yet. Once cards exist, I will use difficulty and weak-card history to pick the toughest topic.`;
  }

  if (normalized.includes("exam")) {
    return `Exam tips for ${deck.title}: turn each answer into a one-sentence recall test, focus on cards marked medium or hard, and explain answers without reading the explanation first. If a card feels fuzzy, mark it as weak and review it again later.`;
  }

  return `I can help with ${deck.title}. This is a local mock response using your deck title, source file, card topics, progress, and weak-card count. Real AI chat can later connect through a backend route with source-aware answers from the uploaded material.`;
};

function ContextMetric({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 rounded-[20px] bg-white px-4 py-3">
      <Text selectable className="font-poppins-semibold text-[12px] leading-[16px] text-muted">
        {label}
      </Text>
      <Text selectable className="mt-1 font-poppins-bold text-[17px] leading-[22px] text-ink">
        {value}
      </Text>
    </View>
  );
}

export default function AiChatTabScreen() {
  const { deckId: deckIdParam } = useLocalSearchParams<{ deckId?: string }>();
  const activeDeckId = useActiveDeckStore((state) => state.activeDeckId);
  const assistantActiveDeckId = useFlashlyAssistantStore((state) => state.activeDeckId);
  const conversationsByDeckId = useFlashlyAssistantStore((state) => state.conversationsByDeckId);
  const setAssistantActiveDeckId = useFlashlyAssistantStore((state) => state.setActiveDeckId);
  const addMessagePair = useFlashlyAssistantStore((state) => state.addMessagePair);
  const deckProgressById = useFlashlyProgressStore((state) => state.deckProgressById);
  const [deckResponse, setDeckResponse] = useState<GetDeckResponse | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [draft, setDraft] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const selectedDeckId = deckIdParam ?? assistantActiveDeckId ?? activeDeckId;
  const deck = deckResponse?.deck ?? null;
  const cards = useMemo(() => deckResponse?.cards ?? [], [deckResponse]);
  const progress = deck ? deckProgressById[deck.id] : undefined;
  const cardCount = cards.length || deck?.cardCount || 0;
  const reviewedCount = Math.min(progress?.reviewedCardIds.length ?? deck?.reviewedCount ?? 0, cardCount);
  const completion = deck ? (progress ? (cardCount > 0 ? reviewedCount / cardCount : 0) : deck.completionPercentage / 100) : 0;
  const weakCardCount = progress?.weakCardIds.length ?? deck?.weakCardCount ?? 0;
  const conversation = deck ? conversationsByDeckId[deck.id] : undefined;
  const messages = conversation?.messages ?? [];

  useEffect(() => {
    let isMounted = true;

    const loadDeck = async () => {
      if (!selectedDeckId) {
        setDeckResponse(null);
        setLoadState("empty");
        return;
      }

      setLoadState("loading");

      try {
        const response = await getDeckById(selectedDeckId);

        if (!isMounted) {
          return;
        }

        if (!response) {
          setDeckResponse(null);
          setLoadState("empty");
          return;
        }

        const cards = await getCardsForDeck(selectedDeckId);
        setDeckResponse({ ...response, cards });
        setLoadState("ready");
      } catch {
        if (isMounted) {
          setLoadState("error");
        }
      }
    };

    loadDeck();

    return () => {
      isMounted = false;
    };
  }, [selectedDeckId]);

  useEffect(() => {
    if (deck?.id) {
      setAssistantActiveDeckId(deck.id);
    }
  }, [deck?.id, setAssistantActiveDeckId]);

  const handleSend = (content: string) => {
    const trimmedContent = content.trim();

    if (!deck || !trimmedContent || isTyping) {
      return;
    }

    const assistantReply = getMockAssistantReply({
      cards,
      deck,
      message: trimmedContent,
      progressPercent: formatPercent(completion),
      weakCardCount,
    });

    setDraft("");
    setIsTyping(true);
    setTimeout(() => {
      addMessagePair(deck.id, trimmedContent, assistantReply, deck.materialId);
      setIsTyping(false);
    }, 420);
  };

  if (loadState === "loading") {
    return (
      <View className="flex-1 items-center justify-center bg-lingua-background px-6">
        <ActivityIndicator size="large" color="#6C4EF5" />
        <Text selectable className="mt-4 text-center text-[15px] leading-[23px] text-muted">
          Loading Assistant context...
        </Text>
      </View>
    );
  }

  if (loadState === "error") {
    return (
      <ScrollView className="bg-lingua-background" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 22 }}>
        <View className="rounded-[32px] bg-white p-6 shadow-card">
          <Text selectable className="text-center font-poppins-bold text-[28px] leading-[35px] text-ink">
            Could not load Assistant
          </Text>
          <Text selectable className="mt-3 text-center text-[16px] leading-[25px] text-muted">
            Something went wrong while reading local deck data.
          </Text>
        </View>
      </ScrollView>
    );
  }

  if (!deck) {
    return (
      <ScrollView
        className="bg-lingua-background"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 22 }}
      >
        <View className="items-center rounded-[32px] bg-white p-6 shadow-card">
          <AnimatedOwl size={96} variant="float" />
          <Text selectable className="text-center font-poppins-bold text-[28px] leading-[35px] text-ink">
            Study Assistant
          </Text>
          <Text selectable className="mt-3 text-center text-[16px] leading-[25px] text-muted">
            Ask me anything about your uploaded material.
          </Text>
          <PressableScale className="mt-6 items-center justify-center rounded-[26px] bg-lingua-purple px-6 py-5" haptic onPress={() => router.push("/decks" as never)}>
            <Text selectable={false} className="font-poppins-semibold text-[18px] leading-[24px] text-white">
              Choose a Deck
            </Text>
          </PressableScale>
          <PressableScale className="mt-3 items-center justify-center rounded-[26px] bg-[#F7F4FF] px-6 py-5" haptic onPress={() => router.push("/upload" as never)}>
            <Text selectable={false} className="font-poppins-semibold text-[18px] leading-[24px] text-lingua-purple">
              Upload Material
            </Text>
          </PressableScale>
        </View>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-lingua-background"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ gap: 16, paddingBottom: 130, paddingHorizontal: 18, paddingTop: 18 }}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Text selectable className="font-poppins-bold text-[30px] leading-[37px] text-ink">
            Study Assistant
          </Text>
          <Text selectable className="mt-1 text-[15px] leading-[22px] text-muted">
            Ask about {deck.title}
          </Text>
        </View>

        <View className="rounded-[30px] bg-lingua-purple p-5 shadow-card">
          <Text selectable className="font-poppins-bold text-[23px] leading-[30px] text-white">
            {deck.title}
          </Text>
          <Text selectable className="mt-2 text-[14px] leading-[21px] text-[#EAE4FF]">
            {deck.sourceFileName}
          </Text>

          <View className="mt-5 flex-row flex-wrap gap-3">
            <ContextMetric label="Progress" value={formatPercent(completion)} />
            <ContextMetric label="Cards" value={String(cardCount)} />
            <ContextMetric label="Weak" value={String(weakCardCount)} />
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {quickPrompts.map((prompt) => (
            <PressableScale
              key={prompt.label}
              className="rounded-full bg-white px-5 py-3 shadow-card"
              haptic
              onPress={() => handleSend(prompt.message)}
            >
              <Text selectable={false} className="font-poppins-semibold text-[14px] leading-[19px] text-lingua-purple">
                {prompt.label}
              </Text>
            </PressableScale>
          ))}
        </ScrollView>

        <View className="gap-3">
          <View className="mr-10 rounded-[26px] bg-white p-5 shadow-card">
            <Text selectable className="font-poppins-semibold text-[14px] leading-[19px] text-lingua-purple">
              Flashly Assistant
            </Text>
            <Text selectable className="mt-2 text-[15px] leading-[23px] text-ink">
              I can help you summarize this deck, quiz you from its cards, explain weak cards, or build a quick study plan.
            </Text>
          </View>

          {messages.map((message) => (
            <Animated.View
              key={message.id}
              entering={FadeInUp.duration(180)}
              className={`rounded-[26px] p-5 shadow-card ${
                message.role === "user" ? "ml-10 bg-lingua-purple" : "mr-10 bg-white"
              }`}
            >
              <Text
                selectable
                className={`text-[15px] leading-[23px] ${
                  message.role === "user" ? "text-white" : "text-ink"
                }`}
              >
                {message.content}
              </Text>
            </Animated.View>
          ))}
          {isTyping ? (
            <Animated.View entering={FadeInUp.duration(180)} className="mr-10 rounded-[26px] bg-white p-5 shadow-card">
              <Text selectable className="font-poppins-semibold text-[14px] leading-[19px] text-lingua-purple">
                Flashly Assistant
              </Text>
              <Text selectable className="mt-2 text-[15px] leading-[23px] text-muted">
                Thinking...
              </Text>
            </Animated.View>
          ) : null}
        </View>
      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0 bg-lingua-background px-4 pb-5 pt-3">
        <View className="flex-row items-center rounded-[28px] bg-white p-2 shadow-card">
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Ask about this deck"
            placeholderTextColor="#8B93AD"
            className="min-h-[48px] flex-1 px-4 font-poppins text-[16px] leading-[22px] text-ink"
            multiline
          />
          <PressableScale
            className={`h-12 w-12 items-center justify-center rounded-full ${
              draft.trim() ? "bg-lingua-purple" : "bg-[#EEF0F8]"
            }`}
            disabled={!draft.trim()}
            haptic
            onPress={() => handleSend(draft)}
          >
            <Text selectable={false} className="font-poppins-bold text-[20px] leading-[22px] text-white">
              {">"}
            </Text>
          </PressableScale>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
