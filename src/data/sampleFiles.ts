import type { SampleFile } from "@/types/learning";

export const sampleFiles: SampleFile[] = [
  {
    id: "file-biology-notes",
    fileName: "biology-notes.pdf",
    fileType: "pdf",
    title: "Biology Notes PDF",
    extractedTextPreview:
      "Cells are the basic unit of life. Mitochondria release energy from food, while ribosomes help build proteins.",
    requiresOCR: false,
    uploadedAt: "2026-05-24T09:15:00.000Z",
  },
  {
    id: "file-project-management-summary",
    fileName: "project-management-summary.txt",
    fileType: "text",
    title: "Project Management Summary",
    extractedTextPreview:
      "A project charter defines scope and stakeholders. Risks should be identified early and reviewed throughout delivery.",
    requiresOCR: false,
    uploadedAt: "2026-05-24T09:45:00.000Z",
  },
  {
    id: "file-safety-instructions-image",
    fileName: "safety-instructions.png",
    fileType: "image",
    title: "Safety Instructions Image",
    extractedTextPreview:
      "Wear protective gloves, keep emergency exits clear, and report damaged equipment before use.",
    requiresOCR: true,
    uploadedAt: "2026-05-24T10:05:00.000Z",
  },
];
