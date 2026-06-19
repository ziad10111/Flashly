import type { StudyType } from "@/types/study";

export const studyTypes: StudyType[] = [
  {
    id: "pdf-notes",
    title: "PDF Notes",
    description: "Turn PDFs into smart flashcards",
    icon: "pdf",
    supportedFileTypes: ["pdf"],
    requiresOCR: false,
    isPopular: true,
  },
  {
    id: "lecture-slides",
    title: "Lecture Slides",
    description: "Convert slides into quick study cards",
    icon: "slides",
    supportedFileTypes: ["pdf", "ppt", "pptx"],
    requiresOCR: false,
    isPopular: true,
  },
  {
    id: "class-notes",
    title: "Class Notes",
    description: "Study from typed or pasted notes",
    icon: "notes",
    supportedFileTypes: ["txt", "md", "pdf"],
    requiresOCR: false,
    isPopular: true,
  },
  {
    id: "textbook-pages",
    title: "Textbook Pages",
    description: "Extract key ideas from book pages",
    icon: "book",
    supportedFileTypes: ["pdf", "jpg", "jpeg", "png"],
    requiresOCR: false,
    isPopular: true,
  },
  {
    id: "handwritten-notes",
    title: "Handwritten Notes",
    description: "Use OCR to read handwritten material",
    icon: "scan-pen",
    supportedFileTypes: ["jpg", "jpeg", "png", "pdf"],
    requiresOCR: true,
    isPopular: true,
  },
  {
    id: "exam-summary",
    title: "Exam Summary",
    description: "Create focused cards for revision",
    icon: "target",
    supportedFileTypes: ["pdf", "txt", "md", "jpg", "jpeg", "png"],
    requiresOCR: false,
    isPopular: true,
  },
];

export const popularStudyTypes = studyTypes.filter((studyType) => studyType.isPopular);
