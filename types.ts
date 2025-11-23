
export enum AppMode {
  FAST = 'FAST',
  SMART = 'SMART',
  VOICE = 'VOICE',
  CREATIVE = 'CREATIVE',
  VIDEO = 'VIDEO'
}

export enum MessageRole {
  USER = 'user',
  MODEL = 'model'
}

export enum AttachmentType {
  IMAGE = 'image',
  FILE = 'file',
  VIDEO = 'video', // For generated videos
  DOCUMENT = 'document' // For PDFs, txt, etc.
}

export enum LiveVoice {
  Puck = 'Puck',
  Charon = 'Charon',
  Kore = 'Kore',
  Fenrir = 'Fenrir',
  Zephyr = 'Zephyr'
}

export enum FastModeStyle {
  STANDARD = 'Standard',
  CONCISE = 'Concise',
  DIRECT = 'Direct',
  MINIMAL = 'Minimal'
}

export enum ImageStyle {
  DEFAULT = 'Default',
  CINEMATIC = 'Cinematic',
  PRODUCT = 'Product Shot',
  HEADSHOT = 'Studio Headshot',
  ANIME = 'Anime',
  CYBERPUNK = 'Cyberpunk',
  OIL_PAINTING = 'Oil Painting',
  RENDER_3D = '3D Render',
  WATERCOLOR = 'Watercolor',
  PIXEL_ART = 'Pixel Art',
  VINTAGE = 'Vintage Film',
  MINIMALIST = 'Minimalist',
  ISOMETRIC = 'Isometric 3D',
  COMIC = 'Comic Book',
  FASHION = 'Fashion Editorial',
  ABSTRACT = 'Abstract'
}

export interface Attachment {
  type: AttachmentType;
  url: string;
  base64?: string; // For API sending
  mimeType?: string;
  name?: string;
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  attachments?: Attachment[];
  isThinking?: boolean;
  modeUsed?: AppMode;
  groundingUrls?: { title: string; uri: string }[];
  executionTime?: number; // Time taken to generate response in ms
  audioData?: string; // Base64 audio data
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  lastUpdated: number;
}

export interface UserSettings {
  apiKey: string; 
}
