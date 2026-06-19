import type { Flashcard } from "@/types/learning";

export const biologyFlashcards: Flashcard[] = [
  {
    id: "card-biology-1",
    deckId: "deck-biology-notes",
    question: "What is the basic unit of life?",
    answer: "The cell.",
    explanation: "All living organisms are made of one or more cells.",
    topic: "cell-biology",
    difficulty: "easy",
    sourcePage: 1,
    sourceSection: "Cell Basics",
  },
  {
    id: "card-biology-2",
    deckId: "deck-biology-notes",
    question: "What is the main role of mitochondria?",
    answer: "They release energy from food.",
    explanation: "Mitochondria produce ATP, which powers cell activities.",
    topic: "cell-biology",
    difficulty: "medium",
    sourcePage: 2,
    sourceSection: "Organelles",
  },
  {
    id: "card-biology-3",
    deckId: "deck-biology-notes",
    question: "Which organelles help build proteins?",
    answer: "Ribosomes.",
    explanation: "Ribosomes read genetic instructions and assemble proteins.",
    topic: "cell-biology",
    difficulty: "medium",
    sourcePage: 2,
    sourceSection: "Organelles",
  },
];

export const projectManagementFlashcards: Flashcard[] = [
  {
    id: "card-project-1",
    deckId: "deck-project-management-summary",
    question: "What does a project charter usually define first?",
    answer: "The project's scope and key stakeholders.",
    explanation: "The charter aligns the team on why the project exists and who is involved.",
    topic: "project-planning",
    difficulty: "easy",
    sourceSection: "Project Charter",
  },
  {
    id: "card-project-2",
    deckId: "deck-project-management-summary",
    question: "When should project risks be identified?",
    answer: "Early in the project and reviewed throughout delivery.",
    explanation: "Risk tracking works best when it starts early and stays active.",
    topic: "risk-management",
    difficulty: "medium",
    sourceSection: "Risk Review",
  },
  {
    id: "card-project-3",
    deckId: "deck-project-management-summary",
    question: "Why are stakeholder reviews useful?",
    answer: "They help catch issues and keep expectations aligned.",
    explanation: "Frequent check-ins reduce surprises and improve decision-making.",
    topic: "project-planning",
    difficulty: "medium",
    sourceSection: "Stakeholder Communication",
  },
];

export const safetyFlashcards: Flashcard[] = [
  {
    id: "card-safety-1",
    deckId: "deck-safety-instructions-image",
    question: "What protective item should be worn when handling hazardous materials?",
    answer: "Protective gloves.",
    explanation: "Gloves reduce direct contact with unsafe substances.",
    topic: "workplace-safety",
    difficulty: "easy",
    sourceSection: "Protective Equipment",
  },
  {
    id: "card-safety-2",
    deckId: "deck-safety-instructions-image",
    question: "What should workers do with emergency exits?",
    answer: "Keep them clear at all times.",
    explanation: "Blocked exits slow evacuation during an emergency.",
    topic: "workplace-safety",
    difficulty: "easy",
    sourceSection: "Emergency Access",
  },
  {
    id: "card-safety-3",
    deckId: "deck-safety-instructions-image",
    question: "What should happen before damaged equipment is used?",
    answer: "It should be reported first.",
    explanation: "Reporting damage helps prevent accidents and downtime.",
    topic: "workplace-safety",
    difficulty: "medium",
    sourceSection: "Equipment Checks",
  },
];

export const flashcardsByDeckId: Record<string, Flashcard[]> = {
  "deck-biology-notes": biologyFlashcards,
  "deck-project-management-summary": projectManagementFlashcards,
  "deck-safety-instructions-image": safetyFlashcards,
};

export const allFlashcards: Flashcard[] = [
  ...biologyFlashcards,
  ...projectManagementFlashcards,
  ...safetyFlashcards,
];
