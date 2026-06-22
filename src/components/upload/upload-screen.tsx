import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { SymbolView, type AndroidSymbol, type SFSymbol } from "expo-symbols";
import semiBold from "expo-symbols/androidWeights/semiBold";
import { Redirect, router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  GeneratedDeckPersistenceError,
  type UploadProcessingStage,
  useFlashlyUploadStore,
} from "@/store/useFlashlyUploadStore";
import { FlashlyApiError } from "@/api/client";
import { ChunkedUploadError, type ChunkedUploadProgress, uploadLargeFileInChunks } from "@/api/chunkedUploadClient";
import { USE_BACKEND_API } from "@/api/config";
import {
  MAX_CHUNKED_UPLOAD_BYTES,
  MAX_SOURCE_IMAGE_INPUT_BYTES,
  MAX_SOURCE_PDF_INPUT_BYTES,
  MAX_SOURCE_TEXT_INPUT_LENGTH,
  MIN_SOURCE_TEXT_INPUT_LENGTH,
} from "@/api/contracts";
import { extractMaterial, generateFlashcardsForMaterial } from "@/api/repositories/materialRepository";
import { createUploadJob } from "@/api/repositories/uploadRepository";
import { PressableScale } from "@/components/animated/pressable-scale";
import { AnimatedOwl } from "@/components/mascot/animated-owl";
import { triggerSuccessHaptic } from "@/lib/feedback/haptics";
import {
  BACKGROUND_BATCH_CARD_COUNT,
  FIRST_BATCH_CARD_COUNT,
  MAX_PROGRESSIVE_PDF_CARDS,
  runRemainingGeneratedDeckBatches,
} from "@/lib/progressive-generation";
import { useStudySelectionStore } from "@/store/useStudySelectionStore";
import { colors } from "@/theme";
import type { SelectedUploadFile, StudyType } from "@/types/study";

const fileTypeLabels: Record<string, string> = {
  heic: "HEIC",
  jpeg: "JPEG",
  jpg: "JPG",
  md: "Markdown",
  pdf: "PDF",
  png: "PNG",
  ppt: "PowerPoint",
  pptx: "PowerPoint",
  txt: "Text",
};

const filePickerTypes: Record<string, string> = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  md: "text/markdown",
  pdf: "application/pdf",
  png: "image/png",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
};

const MAX_TEXT_FILE_READ_BYTES = 64 * 1024;

type UploadSymbol = {
  android: AndroidSymbol;
  ios: SFSymbol;
};

const stageCopy: Record<UploadProcessingStage, { label: string; detail: string }> = {
  idle: {
    label: "Choose a file",
    detail: "Select study material to begin.",
  },
  uploading: {
    label: "Uploading file",
    detail: "Preparing your material for processing...",
  },
  assembling: {
    label: "File assembled",
    detail: "Your PDF is back together. Flashly is getting ready to extract text...",
  },
  extracting: {
    label: "Extracting text",
    detail: "Extracting key ideas from the selected file...",
  },
  ocr: {
    label: "Running OCR",
    detail: "Scanned PDF detected. Reading the pages with OCR...",
  },
  "ocr-skipped": {
    label: "OCR not needed",
    detail: "The file already looks readable, so OCR is skipped.",
  },
  generating: {
    label: "Creating first cards",
    detail: "Finding important questions so you can start studying quickly...",
  },
  creating: {
    label: "Opening your deck",
    detail: "Your first cards are almost ready.",
  },
  ready: {
    label: "First cards ready",
    detail: "You can start studying now while more cards generate in the background.",
  },
};

const formatSupportedFileTypes = (supportedFileTypes: StudyType["supportedFileTypes"]) =>
  supportedFileTypes
    .map((fileType) => fileTypeLabels[fileType] ?? fileType.toUpperCase())
    .join(", ");

const formatFileSize = (size?: number) => {
  if (!size || Number.isNaN(size)) {
    return "Unknown size";
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const getAllowedMimeTypes = (supportedFileTypes: StudyType["supportedFileTypes"]) => {
  const mimeTypes = supportedFileTypes
    .map((fileType) => filePickerTypes[fileType])
    .filter(Boolean);

  return mimeTypes.length > 0 ? mimeTypes : ["*/*"];
};

const getFileExtension = (fileName: string) => fileName.split(".").pop()?.toLowerCase() ?? "";

class TextFileReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TextFileReadError";
  }
}

class BinaryFileReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BinaryFileReadError";
  }
}

class UploadFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadFlowError";
  }
}

const isTextBasedUpload = (file: SelectedUploadFile) => {
  const extension = getFileExtension(file.name);
  const mimeType = file.mimeType?.toLowerCase() ?? "";

  return (
    ["txt", "md"].includes(extension) ||
    ["text/plain", "text/markdown", "text/x-markdown", "text/md"].includes(mimeType)
  );
};

const isPdfUpload = (file: SelectedUploadFile) => {
  const extension = getFileExtension(file.name);
  const mimeType = file.mimeType?.toLowerCase() ?? "";

  return extension === "pdf" || mimeType === "application/pdf";
};

const isSupportedImageUpload = (file: SelectedUploadFile) => {
  const extension = getFileExtension(file.name);
  const mimeType = file.mimeType?.toLowerCase() ?? "";

  return (
    ["jpg", "jpeg", "png"].includes(extension) ||
    ["image/jpeg", "image/png"].includes(mimeType)
  );
};

const readSourceTextFromFile = async (file: SelectedUploadFile) => {
  if (!isTextBasedUpload(file)) {
    return undefined;
  }

  if (!file.uri) {
    throw new TextFileReadError("This text file could not be read from the device.");
  }

  if (file.size && file.size > MAX_TEXT_FILE_READ_BYTES) {
    throw new TextFileReadError("Text uploads are limited to 64 KB for this MVP extraction path.");
  }

  const text = (await FileSystem.readAsStringAsync(file.uri, {
    encoding: FileSystem.EncodingType.UTF8,
  })).trim();

  if (text.length < MIN_SOURCE_TEXT_INPUT_LENGTH) {
    throw new TextFileReadError("This text file is too short to generate useful flashcards.");
  }

  return text.slice(0, MAX_SOURCE_TEXT_INPUT_LENGTH);
};

const readSourceBase64FromFile = async (file: SelectedUploadFile) => {
  const isPdf = isPdfUpload(file);
  const isImage = isSupportedImageUpload(file);

  if (!isPdf && !isImage) {
    return undefined;
  }

  if (!file.uri) {
    throw new BinaryFileReadError("This file could not be read from the device.");
  }

  const maxBytes = isPdf ? MAX_SOURCE_PDF_INPUT_BYTES : MAX_SOURCE_IMAGE_INPUT_BYTES;
  const label = isPdf ? "PDF" : "Image";

  if (file.size && file.size > maxBytes) {
    throw new BinaryFileReadError(
      `${label} uploads are too large to process in one request in this MVP. Try a smaller file; after extraction, Flashly will split the text into safer AI generation chunks.`,
    );
  }

  try {
    return await FileSystem.readAsStringAsync(file.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch {
    throw new BinaryFileReadError(`Flashly could not read this ${label} from the device. Please choose the file again and try once more.`);
  }
};

const getBackendFlowErrorMessage = (error: unknown) => {
  if (error instanceof TextFileReadError || error instanceof BinaryFileReadError || error instanceof UploadFlowError) {
    return error.message;
  }

  if (error instanceof ChunkedUploadError) {
    return error.message;
  }

  if (error instanceof GeneratedDeckPersistenceError) {
    return error.message;
  }

  if (error instanceof FlashlyApiError) {
    const message = error.error.message.toLowerCase();

    if (error.error.code === "unsupported-media") {
      return "Flashly can use .txt, .md, text PDFs, JPG, and PNG files in the backend demo right now.";
    }

    if (error.error.code === "rate-limited") {
      return error.error.message;
    }

    if (error.error.code === "validation-error") {
      if (message.includes("valid pdf") || message.includes("application/pdf") || message.includes("does not look like a valid pdf")) {
        return "This file does not look like a supported PDF. Please upload a text-based PDF, TXT/MD file, or readable JPG/PNG image.";
      }

      if (message.includes("pdf extraction requires sourcebase64")) {
        return "Flashly could not read this PDF from the device. Please choose the file again and try once more.";
      }

      if (message.includes("jpeg") || message.includes("png")) {
        return "Image OCR supports JPG and PNG files only right now.";
      }

      if (message.includes("sourcebase64") || message.includes("filesize") || message.includes("file size")) {
        return "This file is too large for the current demo extraction path.";
      }

      return "Flashly could not use this file yet. Check that it is readable and has enough study text.";
    }

    if (error.error.code === "not-ready") {
      if (message.includes("compressed page data") || message.includes("pdf parser")) {
        return "Flashly could not parse selectable text from this PDF. Try a simpler text-based PDF, TXT/MD file, or readable JPG/PNG image.";
      }

      if (message.includes("couldn't read this pdf") || message.includes("clearer scan")) {
        return "We couldn't read this PDF. Try a clearer scan or upload page images.";
      }

      if (message.includes("ocr provider") || message.includes("image ocr") || message.includes("pdf ocr")) {
        return "OCR is not configured on the backend yet. Add the server-only OCR provider settings, then try again.";
      }

      if (message.includes("ocr did not find")) {
        return "OCR did not find enough readable study text in this image. Try a clearer JPG or PNG.";
      }

      if (message.includes("too little") || message.includes("enough readable study text") || message.includes("at least")) {
        return "Flashly found too little readable text to make useful flashcards. Try a text-based PDF, TXT/MD file, or a clearer image.";
      }

      return "Flashly could not extract enough study text from this file. Try a file with more readable notes.";
    }

    if (error.error.code === "processing-failed" && (message.includes("pdf") || message.includes("parser"))) {
      return "Flashly could not parse selectable text from this PDF. Try a text-based PDF, TXT/MD file, or a readable JPG/PNG image.";
    }

    if (error.error.code === "processing-failed" && (message.includes("ocr") || message.includes("read this pdf"))) {
      return message.includes("pdf")
        ? "We couldn't read this PDF. Try a clearer scan or upload page images."
        : "Flashly could not finish OCR for this image right now. Check the backend OCR configuration and try again.";
    }

    if (message.includes("external generation requires") || message.includes("flashly_ai")) {
      return "AI generation is not configured yet. Add the server-only AI environment variables, then try again.";
    }

    if (message.includes("not valid json") || message.includes("valid flashcards") || message.includes("flashcards array")) {
      return "The AI response could not be turned into flashcards. Try again with clearer study notes.";
    }

    if (message.includes("provider") || message.includes("ai")) {
      return "Flashly could not reach the AI generator right now. Check the server AI configuration and try again.";
    }

    return error.error.message || "Flashly could not finish processing this file. Try another readable study file.";
  }

  if (error instanceof TypeError) {
    return "Flashly could not reach the backend API. Make sure the Expo dev server is running, then try again.";
  }

  return null;
};

const validateBackendDemoFile = (file: SelectedUploadFile) => {
  if (isTextBasedUpload(file)) {
    return;
  }

  if (isPdfUpload(file)) {
    if (file.size && file.size > MAX_CHUNKED_UPLOAD_BYTES) {
      throw new UploadFlowError(
        `This PDF is too large for the MVP chunked upload path. Try a PDF under ${formatFileSize(MAX_CHUNKED_UPLOAD_BYTES)}.`,
      );
    }

    return;
  }

  if (isSupportedImageUpload(file)) {
    if (file.size && file.size > MAX_SOURCE_IMAGE_INPUT_BYTES) {
      throw new UploadFlowError(`Image uploads are limited to ${formatFileSize(MAX_SOURCE_IMAGE_INPUT_BYTES)} for this demo extraction path.`);
    }

    return;
  }

  const extension = getFileExtension(file.name);

  if (["heic", "ppt", "pptx"].includes(extension)) {
    throw new UploadFlowError("This demo can extract .txt, .md, text PDFs, JPG, and PNG files. Slides and HEIC images are still future work.");
  }

  throw new UploadFlowError("Choose a .txt, .md, text PDF, JPG, or PNG file for this demo extraction path.");
};

const shouldUseOcr = (file: SelectedUploadFile, studyType: StudyType) => {
  const extension = getFileExtension(file.name);
  const mimeType = file.mimeType ?? "";

  if (isPdfUpload(file) || isTextBasedUpload(file)) {
    return false;
  }

  return (
    studyType.requiresOCR ||
    studyType.id === "textbook-pages" ||
    mimeType.startsWith("image/") ||
    ["jpg", "jpeg", "png", "heic"].includes(extension)
  );
};

const getOcrMessage = (studyType: StudyType) =>
  studyType.requiresOCR || studyType.id === "textbook-pages"
    ? "Required or may be required"
    : "Used only when the file looks scanned or image-based";

const getSelectedFileProcessingLabel = (file: SelectedUploadFile, ocrRequired: boolean) => {
  if (isPdfUpload(file)) {
    if (file.size && file.size > MAX_SOURCE_PDF_INPUT_BYTES) {
      return "Large PDF chunk upload";
    }

    return "PDF text extraction first";
  }

  if (isSupportedImageUpload(file)) {
    return ocrRequired ? "OCR will run for this image" : "OCR may run if needed";
  }

  if (isTextBasedUpload(file)) {
    return "Text extraction";
  }

  return ocrRequired ? "OCR may be required" : "OCR not needed";
};

const isLargePdfUpload = (file: SelectedUploadFile | null) =>
  Boolean(file && isPdfUpload(file) && file.size && file.size > MAX_SOURCE_PDF_INPUT_BYTES);

const getStageFlow = (ocrRequired: boolean, includeAssembly: boolean): { stage: UploadProcessingStage; progress: number }[] => {
  const flow: { stage: UploadProcessingStage; progress: number }[] = [{ stage: "uploading", progress: 12 }];

  if (includeAssembly) {
    flow.push({ stage: "assembling", progress: 30 });
  }

  flow.push(
    { stage: "extracting", progress: includeAssembly ? 42 : 34 },
    { stage: ocrRequired ? "ocr" : "ocr-skipped", progress: 58 },
    { stage: "generating", progress: 78 },
    { stage: "creating", progress: 94 },
  );

  return flow;
};

const uploadSymbols: Record<UploadProcessingStage, UploadSymbol> = {
  assembling: { android: "inventory_2", ios: "shippingbox.fill" },
  creating: { android: "auto_awesome", ios: "sparkles" },
  extracting: { android: "text_snippet", ios: "text.page.fill" },
  generating: { android: "wand_stars", ios: "wand.and.stars" },
  idle: { android: "upload_file", ios: "square.and.arrow.up.fill" },
  ocr: { android: "visibility", ios: "eye.fill" },
  "ocr-skipped": { android: "check_circle", ios: "checkmark.circle.fill" },
  ready: { android: "check_circle", ios: "checkmark.circle.fill" },
  uploading: { android: "cloud_upload", ios: "icloud.and.arrow.up.fill" },
};

const stageToOwlMood = (stage: UploadProcessingStage) => {
  if (stage === "uploading") {
    return "uploading";
  }

  if (stage === "assembling" || stage === "extracting" || stage === "ocr" || stage === "ocr-skipped") {
    return "extracting";
  }

  if (stage === "generating" || stage === "creating") {
    return "generating";
  }

  if (stage === "ready") {
    return "success";
  }

  return "idle";
};

function UploadIcon({
  color,
  fallback,
  name,
  size = 22,
}: {
  color: string;
  fallback: string;
  name: UploadSymbol;
  size?: number;
}) {
  return (
    <View className="items-center justify-center">
      <Text selectable={false} className="font-poppins-bold text-[12px] leading-[16px]" style={{ color }}>
        {fallback}
      </Text>
      <SymbolView
        name={name}
        size={size}
        tintColor={color}
        weight={{ android: semiBold, ios: "semibold" }}
        fallback={
          <Text selectable={false} className="font-poppins-bold text-[12px] leading-[16px]" style={{ color }}>
            {fallback}
          </Text>
        }
        style={{ height: 24, position: "absolute", width: 24 }}
      />
    </View>
  );
}

function InfoPill({ label }: { label: string }) {
  return (
    <View className="rounded-full bg-white px-4 py-2">
      <Text selectable className="font-poppins-semibold text-[12px] leading-[16px] text-lingua-deep-purple">
        {label}
      </Text>
    </View>
  );
}

function ProcessingStageRail({
  activeStageIndex,
  activeStageLabel,
  currentStage,
  isReady,
  stageFlow,
}: {
  activeStageIndex: number;
  activeStageLabel: string;
  currentStage: UploadProcessingStage;
  isReady: boolean;
  stageFlow: { stage: UploadProcessingStage; progress: number }[];
}) {
  const steps = isReady ? [...stageFlow, { stage: "ready" as UploadProcessingStage, progress: 100 }] : stageFlow;
  const compactStageLabels: Partial<Record<UploadProcessingStage, string>> = {
    assembling: "Assemble",
    creating: "Ready",
    extracting: "Extract",
    generating: "Generate",
    ocr: "OCR",
    "ocr-skipped": "Extracted",
    ready: "Ready",
    uploading: "Upload",
  };

  return (
    <View className="mt-4 rounded-[22px] bg-white px-3 py-3">
      <View className="flex-row items-center justify-between">
        <Text selectable className="font-poppins-semibold text-[13px] leading-[18px] text-muted">
          Processing steps
        </Text>
        <Text selectable className="font-poppins-semibold text-[13px] leading-[18px] text-lingua-purple">
          {activeStageLabel}
        </Text>
      </View>

      <ScrollView className="mt-2" horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row items-center gap-2 pr-2">
          {steps.map((step, index) => {
            const isComplete = isReady || index < activeStageIndex;
            const isActive = isReady ? step.stage === "ready" : step.stage === currentStage;
            const color = isComplete ? "#21C16B" : isActive ? "#6C4EF5" : "#8B93AD";
            const tint = isComplete ? "#E8FFF2" : isActive ? "#F5F0FF" : "#F4F6FB";
            const label = compactStageLabels[step.stage] ?? stageCopy[step.stage].label;

            return (
              <View
                key={`${step.stage}-${index}`}
                className="flex-row items-center rounded-full border px-3 py-2"
                style={{
                  backgroundColor: tint,
                  borderColor: isActive ? "#D8CCFF" : "#EEF0F8",
                }}
              >
                <UploadIcon
                  color={color}
                  fallback={isComplete ? "OK" : isActive ? "GO" : String(index + 1)}
                  name={isComplete ? uploadSymbols.ready : uploadSymbols[step.stage]}
                  size={16}
                />
                <Text selectable className="ml-2 font-poppins-semibold text-[12px] leading-[16px]" style={{ color }}>
                  {label}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const getActiveStageCopy = ({
  chunkProgress,
  currentStage,
  isLargeFile,
}: {
  chunkProgress: ChunkedUploadProgress | null;
  currentStage: UploadProcessingStage;
  isLargeFile: boolean;
}) => {
  if (isLargeFile && currentStage === "uploading") {
    if (!chunkProgress) {
      return {
        label: "Large file detected",
        detail: "Flashly will upload it in smaller parts...",
      };
    }

    const nextPart = Math.min(chunkProgress.uploadedChunks + 1, chunkProgress.totalChunks);

    return {
      label: "Uploading large file",
      detail:
        chunkProgress.uploadedChunks >= chunkProgress.totalChunks
          ? "All parts uploaded. Assembling the file..."
          : `Uploading part ${nextPart} / ${chunkProgress.totalChunks}`,
    };
  }

  return stageCopy[currentStage];
};

export function UploadScreen() {
  const insets = useSafeAreaInsets();
  const hasHydrated = useStudySelectionStore((state) => state.hasHydrated);
  const selectedStudyType = useStudySelectionStore((state) => state.selectedStudyType);
  const selectedFile = useFlashlyUploadStore((state) => state.selectedFile);
  const status = useFlashlyUploadStore((state) => state.status);
  const currentStage = useFlashlyUploadStore((state) => state.currentStage);
  const progressPercentage = useFlashlyUploadStore((state) => state.progressPercentage);
  const errorMessage = useFlashlyUploadStore((state) => state.errorMessage);
  const ocrRequired = useFlashlyUploadStore((state) => state.ocrRequired);
  const generatedDeckId = useFlashlyUploadStore((state) => state.generatedDeckId);
  const idempotencyKey = useFlashlyUploadStore((state) => state.idempotencyKey);
  const selectFile = useFlashlyUploadStore((state) => state.selectFile);
  const startMockProcessing = useFlashlyUploadStore((state) => state.startMockProcessing);
  const setProcessingStage = useFlashlyUploadStore((state) => state.setProcessingStage);
  const setOcrRequired = useFlashlyUploadStore((state) => state.setOcrRequired);
  const completeMockGeneration = useFlashlyUploadStore((state) => state.completeMockGeneration);
  const createPartialGeneratedDeck = useFlashlyUploadStore((state) => state.createPartialGeneratedDeck);
  const persistGeneratedDeckResponse = useFlashlyUploadStore((state) => state.persistGeneratedDeckResponse);
  const resetUpload = useFlashlyUploadStore((state) => state.resetUpload);
  const [isSelecting, setIsSelecting] = useState(false);
  const [isBackendProcessing, setIsBackendProcessing] = useState(false);
  const [chunkProgress, setChunkProgress] = useState<ChunkedUploadProgress | null>(null);
  const lastTrialAlertMessage = useRef<string | null>(null);
  const isLargeSelectedPdf = isLargePdfUpload(selectedFile);
  const stageFlow = useMemo(() => getStageFlow(ocrRequired, isLargeSelectedPdf), [isLargeSelectedPdf, ocrRequired]);
  const contentStyle = useMemo(
    () => ({
      flexGrow: 1,
      paddingBottom: Math.max(insets.bottom + 132, 156),
      paddingHorizontal: 16,
      paddingTop: Math.max(insets.top + 10, 22),
    }),
    [insets.bottom, insets.top],
  );

  useEffect(() => {
    if (status !== "processing" || isBackendProcessing) {
      return;
    }

    const currentIndex = stageFlow.findIndex((item) => item.stage === currentStage);

    if (currentIndex === -1) {
      return;
    }

    const timer = setTimeout(() => {
      const nextStep = stageFlow[currentIndex + 1];

      if (nextStep) {
        setProcessingStage(nextStep.stage, nextStep.progress);
        return;
      }

      completeMockGeneration();
    }, currentStage === "ocr-skipped" ? 650 : 900);

    return () => clearTimeout(timer);
  }, [completeMockGeneration, currentStage, isBackendProcessing, setProcessingStage, stageFlow, status]);

  useEffect(() => {
    if (!errorMessage?.toLowerCase().includes("free trial is complete")) {
      return;
    }

    if (lastTrialAlertMessage.current === errorMessage) {
      return;
    }

    lastTrialAlertMessage.current = errorMessage;
    Alert.alert(
      "Your free trial is complete",
      "You've used Flashly for 3 days. Upgrade to Pro to keep generating smart flashcards.",
      [
        { text: "Maybe later", style: "cancel" },
        {
          text: "Upgrade to Pro",
          onPress: () => router.push("/upgrade" as never),
        },
      ],
    );
  }, [errorMessage]);

  const handleChooseFile = async () => {
    if (!selectedStudyType || status === "processing") {
      return;
    }

    setIsSelecting(true);

    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: getAllowedMimeTypes(selectedStudyType.supportedFileTypes),
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets[0];
      const nextFile = {
        name: asset.name,
        size: asset.size,
        mimeType: asset.mimeType ?? undefined,
        uri: asset.uri,
      };

      selectFile(nextFile, shouldUseOcr(nextFile, selectedStudyType));
    } catch {
      useFlashlyUploadStore
        .getState()
        .failMockGeneration("We couldn't open the file picker. Please try another file.");
    } finally {
      setIsSelecting(false);
    }
  };

  const handleGenerateFlashcards = async () => {
    if (!selectedFile || !selectedStudyType || status === "processing") {
      return;
    }

    if (USE_BACKEND_API) {
      try {
        validateBackendDemoFile(selectedFile);
      } catch (error) {
        const message = getBackendFlowErrorMessage(error) ?? "Flashly could not use this file for the MVP AI demo.";
        useFlashlyUploadStore.getState().failMockGeneration(message);
        return;
      }
    }

    if (!USE_BACKEND_API) {
      startMockProcessing();
      return;
    }

    setIsBackendProcessing(true);
    setChunkProgress(null);
    setProcessingStage("uploading", 12);

    try {
      const upload = await createUploadJob({
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        mimeType: selectedFile.mimeType,
        materialTypeId: selectedStudyType.id,
        idempotencyKey: idempotencyKey ?? `mock-upload-${selectedFile.name}`,
      });

      const sourceText = await readSourceTextFromFile(selectedFile);
      let sourceBase64: string | undefined;
      let sourceUploadId: string | undefined;
      let extractionFileName = selectedFile.name;
      let extractionFileSize = selectedFile.size;
      let extractionMimeType = selectedFile.mimeType;

      if (!sourceText && isLargeSelectedPdf) {
        const assembledFile = await uploadLargeFileInChunks({
          fileName: selectedFile.name,
          fileSize: selectedFile.size ?? 0,
          fileUri: selectedFile.uri ?? "",
          mimeType: selectedFile.mimeType ?? "application/pdf",
          onAssembling: () => setProcessingStage("assembling", 30),
          onProgress: (progress) => {
            setChunkProgress(progress);
            setProcessingStage("uploading", Math.min(12 + Math.round(progress.percent * 0.16), 28));
          },
          storageKey: upload.storageKey,
        });

        sourceBase64 = assembledFile.sourceBase64;
        sourceUploadId = assembledFile.sourceUploadId;
        extractionFileName = assembledFile.fileName;
        extractionFileSize = assembledFile.fileSize;
        extractionMimeType = assembledFile.mimeType;
      } else {
        sourceBase64 = sourceText ? undefined : await readSourceBase64FromFile(selectedFile);
      }

      setProcessingStage("extracting", isLargeSelectedPdf ? 42 : 34);
      const shouldForceOcr = isSupportedImageUpload(selectedFile) && upload.ocrRequired;

      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.info("[Flashly Upload] extraction input", {
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          hasSourceBase64: Boolean(sourceBase64),
          hasSourceUploadId: Boolean(sourceUploadId),
          mimeType: selectedFile.mimeType,
          sourceType: upload.sourceType,
        });
      }

      const extraction = await extractMaterial({
        fileName: extractionFileName,
        fileSize: extractionFileSize,
        materialId: upload.materialId,
        mimeType: extractionMimeType,
        forceOcr: shouldForceOcr,
        sourceBase64,
        sourceUploadId,
        sourceText,
        sourceType: upload.sourceType,
        storageKey: upload.storageKey,
      });

      setOcrRequired(extraction.ocrRequired);
      setProcessingStage(extraction.ocrRequired ? "ocr" : "ocr-skipped", 58);
      setProcessingStage("generating", 78);

      const isProgressivePdf = isPdfUpload(selectedFile);

      if (isProgressivePdf && typeof __DEV__ !== "undefined" && __DEV__) {
          console.info("[Flashly Upload] progressive generation first batch started", {
          batchSize: FIRST_BATCH_CARD_COUNT,
          maxCards: MAX_PROGRESSIVE_PDF_CARDS,
          materialId: upload.materialId,
        });
      }

      const generation = await generateFlashcardsForMaterial({
        materialId: upload.materialId,
        extractedTextPreview: extraction.extractedTextPreview,
        generationMode: isProgressivePdf ? "comprehensive" : "sample",
        batchMode: isProgressivePdf ? "batch" : "all",
        batchIndex: isProgressivePdf ? 0 : undefined,
        batchSize: isProgressivePdf ? FIRST_BATCH_CARD_COUNT : undefined,
        startQuestionIndex: isProgressivePdf ? 0 : undefined,
        maxCards: isProgressivePdf ? MAX_PROGRESSIVE_PDF_CARDS : 10,
        requestedCardCount: isProgressivePdf ? FIRST_BATCH_CARD_COUNT : 10,
        idempotencyKey: upload.idempotencyKey,
      });

      setProcessingStage("creating", 94);
      const persistedDeckId = isProgressivePdf
        ? createPartialGeneratedDeck(generation, {
            backgroundBatchSize: BACKGROUND_BATCH_CARD_COUNT,
            generationSourceText: extraction.extractedTextPreview,
            maxGeneratedCards: MAX_PROGRESSIVE_PDF_CARDS,
            nextBatchStartIndex: FIRST_BATCH_CARD_COUNT,
          })
        : persistGeneratedDeckResponse(generation);

      if (!persistedDeckId || useFlashlyUploadStore.getState().generatedCardsByDeckId[persistedDeckId]?.length === 0) {
        throw new UploadFlowError("Flashly generated cards, but could not save the deck locally. Please try again.");
      }
      triggerSuccessHaptic();

      if (isProgressivePdf) {
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.info("[Flashly Upload] partial deck created", {
            deckId: persistedDeckId,
            expectedTotalCards: generation.expectedTotalCards,
            firstBatchCardCount: generation.cards.length,
            hasMore: generation.hasMore,
          });
        }

        router.replace(`/deck/${persistedDeckId}` as never);

        // Background batches are requested while the app stays open; in database mode,
        // each successful batch is persisted by the backend and mirrored locally.
        if (generation.hasMore) {
          void runRemainingGeneratedDeckBatches({
            batchSize: BACKGROUND_BATCH_CARD_COUNT,
            deckId: persistedDeckId,
            errorToMessage: getBackendFlowErrorMessage,
            extractedTextPreview: extraction.extractedTextPreview ?? "",
            idempotencyKey: upload.idempotencyKey,
            materialId: upload.materialId,
            maxCards: MAX_PROGRESSIVE_PDF_CARDS,
            startQuestionIndex: FIRST_BATCH_CARD_COUNT,
          });
        } else {
          useFlashlyUploadStore.getState().markGeneratedDeckComplete(persistedDeckId);
        }
      }
    } catch (error) {
      const message = getBackendFlowErrorMessage(error);

      if (message) {
        useFlashlyUploadStore.getState().failMockGeneration(message);
        return;
      }

      useFlashlyUploadStore
        .getState()
        .failMockGeneration("Flashly could not finish backend AI generation. Please try again with readable study text.");
    } finally {
      setIsBackendProcessing(false);
    }
  };

  const handleOpenDeck = () => {
    if (!generatedDeckId) {
      return;
    }

    router.push(`/deck/${generatedDeckId}` as never);
  };

  const handleChangeMaterialType = () => {
    router.replace("/study-type" as never);
  };

  if (!hasHydrated) {
    return (
      <View className="flex-1 items-center justify-center bg-lingua-background px-6">
        <ActivityIndicator size="large" color={colors.primary.purple} />
      </View>
    );
  }

  if (!selectedStudyType) {
    return <Redirect href={"/study-type" as never} />;
  }

  const activeStageIndex = stageFlow.findIndex((item) => item.stage === currentStage);
  const isProcessing = status === "processing";
  const isReady = status === "ready";
  const isTrialExpiredError = Boolean(errorMessage?.toLowerCase().includes("free trial is complete"));
  const isLimitError = Boolean(errorMessage?.toLowerCase().includes("upgrade to pro") || isTrialExpiredError);
  const activeStageCopy = getActiveStageCopy({
    chunkProgress,
    currentStage,
    isLargeFile: isLargeSelectedPdf,
  });
  const selectedFileType = selectedFile
    ? fileTypeLabels[getFileExtension(selectedFile.name)] ?? selectedFile.mimeType ?? "File"
    : null;
  const selectedProcessingMode = selectedFile
    ? getSelectedFileProcessingLabel(selectedFile, ocrRequired)
    : "Select a file first";
  const canGenerate = Boolean(selectedFile && !isProcessing && !isReady);

  return (
    <ScrollView
      className="bg-lingua-background"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={contentStyle}
      showsVerticalScrollIndicator={false}
    >
      <View className="gap-3">
        <Animated.View entering={FadeInDown.duration(180)} className="flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text selectable className="font-poppins-bold text-[30px] leading-[36px] text-ink">
              Upload Material
            </Text>
            <Text selectable className="mt-1 text-[15px] leading-[22px] text-muted">
              Turn files into AI flashcards.
            </Text>
          </View>
          <View className="h-14 w-14 items-center justify-center rounded-[20px] bg-[#F3EFFF]">
            <AnimatedOwl mood={selectedFile ? "success" : "idle"} size={46} variant="float" />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(40).duration(180)} className="rounded-[22px] border border-[#ECE8FF] bg-white px-4 py-3 shadow-card">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text selectable className="text-[12px] leading-[16px] text-muted">
                Material Type
              </Text>
              <Text selectable className="mt-1 font-poppins-bold text-[17px] leading-[23px] text-ink">
                {selectedStudyType.title}
              </Text>
              <Text selectable className="mt-1 text-[13px] leading-[19px] text-[#6B7395]">
                {formatSupportedFileTypes(selectedStudyType.supportedFileTypes)} / {getOcrMessage(selectedStudyType)}
              </Text>
            </View>
            <Pressable className="rounded-full bg-[#F5F0FF] px-4 py-2" disabled={isProcessing} onPress={handleChangeMaterialType}>
              <Text selectable={false} className="font-poppins-semibold text-[13px] leading-[18px] text-lingua-purple">
                Change
              </Text>
            </Pressable>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(80).duration(180)} className="rounded-[24px] border border-[#ECEEF5] bg-white p-4 shadow-card">
          <View className="flex-row items-center">
            <View className="h-11 w-11 items-center justify-center rounded-[16px] bg-[#F7F4FF]">
              <UploadIcon color="#6C4EF5" fallback="F" name={selectedFile ? uploadSymbols.ready : uploadSymbols.idle} size={24} />
            </View>
            <View className="ml-3 flex-1">
              <Text selectable className="text-[12px] leading-[16px] text-muted">
                Selected File
              </Text>
              <Text selectable className="mt-1 font-poppins-bold text-[18px] leading-[24px] text-ink" numberOfLines={2}>
                {selectedFile?.name ?? "No file selected"}
              </Text>
              <Text selectable className="mt-1 text-[13px] leading-[19px] text-[#6B7395]">
                {selectedFile ? `${selectedFileType} / ${formatFileSize(selectedFile.size)}` : "Choose a PDF, image, Markdown, or text file."}
              </Text>
            </View>
          </View>

          <View className="mt-3 flex-row flex-wrap gap-2">
            <InfoPill label={`Type: ${selectedFileType ?? "None"}`} />
            <InfoPill label={`Size: ${selectedFile ? formatFileSize(selectedFile.size) : "-"}`} />
            <InfoPill label={`Mode: ${selectedProcessingMode}`} />
          </View>

          <View className="mt-4 gap-3">
            <PressableScale
              className={`items-center justify-center rounded-[22px] bg-[#F5F0FF] px-5 py-3 ${
                isSelecting || isProcessing ? "opacity-70" : ""
              }`}
              disabled={isSelecting || isProcessing}
              haptic
              onPress={handleChooseFile}
            >
              <Text selectable={false} className="font-poppins-semibold text-[16px] leading-[22px] text-lingua-purple">
                {isSelecting ? "Choosing file..." : selectedFile ? "Choose Another File" : "Choose File"}
              </Text>
            </PressableScale>

            {!isReady ? (
              <PressableScale
                className={`items-center justify-center rounded-[24px] px-6 py-4 shadow-card ${
                  canGenerate ? "bg-lingua-purple" : "bg-[#D8DCEB]"
                }`}
                disabled={!canGenerate}
                haptic={canGenerate}
                onPress={handleGenerateFlashcards}
              >
                <Text selectable={false} className="font-poppins-semibold text-[19px] leading-[25px] text-white">
                  Generate AI Flashcards
                </Text>
              </PressableScale>
            ) : null}
          </View>
        </Animated.View>

        {errorMessage ? (
          <Animated.View entering={FadeInDown.duration(180)} className="rounded-[26px] border border-[#FFD6D6] bg-[#FFF6F6] p-5">
            <View className="flex-row items-start">
              <View className="h-10 w-10 items-center justify-center rounded-full bg-white">
                <UploadIcon color="#C43D32" fallback="!" name={{ android: "warning", ios: "exclamationmark.triangle.fill" }} size={20} />
              </View>
              <Text selectable className="ml-3 flex-1 text-[15px] leading-[23px] text-[#C43D32]">
                {errorMessage}
              </Text>
            </View>
            {isLimitError ? (
              <PressableScale
                className="mt-4 items-center justify-center rounded-[22px] bg-[#FFE8E8] px-5 py-3"
                haptic
                onPress={() => router.push("/upgrade" as never)}
              >
                <Text selectable={false} className="font-poppins-semibold text-[14px] leading-[20px] text-[#C43D32]">
                  Upgrade to Pro
                </Text>
              </PressableScale>
            ) : null}
          </Animated.View>
        ) : null}

        {isProcessing || isReady ? (
          <Animated.View entering={FadeInDown.delay(210).duration(220)} className="rounded-[28px] border border-[#ECE8FF] bg-[#F7F4FF] p-4 shadow-card">
            <View className="flex-row items-center">
              <View className="h-[74px] w-[74px] items-center justify-center rounded-[22px] bg-white/75">
                <AnimatedOwl
                  mood={stageToOwlMood(currentStage)}
                  size={54}
                  variant={isReady ? "celebrate" : "bounce"}
                />
              </View>
              <View className="ml-3 flex-1" style={{ flexShrink: 1 }}>
                <Text selectable className="font-poppins-bold text-[20px] leading-[26px] text-ink">
                  {activeStageCopy.label}
                </Text>
                <Text selectable className="mt-1 text-[14px] leading-[20px] text-muted">
                  {activeStageCopy.detail}
                </Text>
              </View>
            </View>

            <View className="mt-4 h-3 overflow-hidden rounded-full bg-[#E8E1FF]">
              <View className="h-full rounded-full bg-lingua-purple" style={{ width: `${progressPercentage}%` }} />
            </View>
            <Text selectable className="mt-2 text-right font-poppins-semibold text-[13px] leading-[18px] text-lingua-purple">
              {progressPercentage}%
            </Text>

            <ProcessingStageRail
              activeStageIndex={activeStageIndex}
              activeStageLabel={activeStageCopy.label}
              currentStage={currentStage}
              isReady={isReady}
              stageFlow={stageFlow}
            />

            {isReady ? (
              <View className="mt-5 gap-2">
                <PressableScale className="items-center justify-center rounded-[26px] bg-lingua-purple px-6 py-4 shadow-card" haptic onPress={handleOpenDeck}>
                  <Text selectable={false} className="font-poppins-semibold text-[20px] leading-[26px] text-white">
                    Start Studying
                  </Text>
                </PressableScale>
                <PressableScale className="items-center justify-center rounded-[26px] bg-white px-6 py-4" haptic onPress={resetUpload}>
                  <Text selectable={false} className="font-poppins-semibold text-[18px] leading-[24px] text-lingua-purple">
                    Upload another file
                  </Text>
                </PressableScale>
              </View>
            ) : null}
          </Animated.View>
        ) : null}
      </View>
    </ScrollView>
  );
}
