import { FLASHLY_DATA_MODE } from "../config";
import {
  databaseAssistantRepository,
  databaseDeckRepository,
  databaseFlashcardRepository,
  databaseMaterialRepository,
  databaseProgressRepository,
  databaseReviewRepository,
  databaseSubscriptionRepository,
  databaseUploadRepository,
  databaseUserRepository,
} from "./database";
import { mockAssistantRepository } from "./mockAssistantRepository";
import { mockDeckRepository } from "./mockDeckRepository";
import { mockFlashcardRepository } from "./mockFlashcardRepository";
import { mockMaterialRepository } from "./mockMaterialRepository";
import { mockProgressRepository } from "./mockProgressRepository";
import { mockReviewRepository } from "./mockReviewRepository";
import { mockSubscriptionRepository } from "./mockSubscriptionRepository";
import { mockUploadRepository } from "./mockUploadRepository";
import { mockUserRepository } from "./mockUserRepository";

export type {
  ServerAssistantRepository,
  ServerDeckRepository,
  ServerFlashcardRepository,
  ServerMaterialRepository,
  ServerProgressRepository,
  ServerReviewRepository,
  ServerSubscriptionRepository,
  ServerUploadRepository,
  ServerUserRepository,
} from "./types";
export { mockAssistantRepository } from "./mockAssistantRepository";
export { mockDeckRepository } from "./mockDeckRepository";
export { mockFlashcardRepository } from "./mockFlashcardRepository";
export { mockMaterialRepository } from "./mockMaterialRepository";
export { mockProgressRepository } from "./mockProgressRepository";
export { mockReviewRepository } from "./mockReviewRepository";
export { mockSubscriptionRepository } from "./mockSubscriptionRepository";
export { mockUploadRepository } from "./mockUploadRepository";
export { mockUserRepository } from "./mockUserRepository";
export {
  databaseAssistantRepository,
  databaseDeckRepository,
  databaseFlashcardRepository,
  databaseMaterialRepository,
  databaseProgressRepository,
  databaseReviewRepository,
  databaseSubscriptionRepository,
  databaseUploadRepository,
  databaseUserRepository,
} from "./database";

export const assistantRepository =
  FLASHLY_DATA_MODE === "database" ? databaseAssistantRepository : mockAssistantRepository;

export const deckRepository = FLASHLY_DATA_MODE === "database" ? databaseDeckRepository : mockDeckRepository;

export const flashcardRepository =
  FLASHLY_DATA_MODE === "database" ? databaseFlashcardRepository : mockFlashcardRepository;

export const materialRepository =
  FLASHLY_DATA_MODE === "database" ? databaseMaterialRepository : mockMaterialRepository;

export const progressRepository =
  FLASHLY_DATA_MODE === "database" ? databaseProgressRepository : mockProgressRepository;

export const reviewRepository = FLASHLY_DATA_MODE === "database" ? databaseReviewRepository : mockReviewRepository;

export const uploadRepository = FLASHLY_DATA_MODE === "database" ? databaseUploadRepository : mockUploadRepository;

export const userRepository = FLASHLY_DATA_MODE === "database" ? databaseUserRepository : mockUserRepository;

export const subscriptionRepository =
  FLASHLY_DATA_MODE === "database" ? databaseSubscriptionRepository : mockSubscriptionRepository;

export const serverRepositories = {
  assistant: assistantRepository,
  deck: deckRepository,
  flashcard: flashcardRepository,
  material: materialRepository,
  progress: progressRepository,
  review: reviewRepository,
  subscription: subscriptionRepository,
  upload: uploadRepository,
  user: userRepository,
};
