export type StudyType = {
  id: string;
  title: string;
  description: string;
  icon: string;
  supportedFileTypes: string[];
  requiresOCR: boolean;
  isPopular: boolean;
};

export type SelectedUploadFile = {
  name: string;
  size?: number;
  mimeType?: string;
  uri: string;
};
