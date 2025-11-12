export enum PartOfSpeech {
  Noun = 'اسم',
  Verb = 'فعل',
  Adjective = 'صفة',
  Adverb = 'ظرف',
  Preposition = 'حرف جر',
  Unspecified = 'غير محدد',
}

export interface WordEntry {
  id: string;
  hassaniya: string;
  arabic: string;
  partOfSpeech: PartOfSpeech;
  dateAdded: string; // ISO String
  notes: string; // New: Grammatical rules, usage examples, etc.
}

export enum AnalysisMode {
  Confirmed = 'confirmed',
  NonMsa = 'non-msa',
  All = 'all',
}

export const LOCAL_STORAGE_KEYS = {
  DATABASE: 'hassaniya_database',
  PENDING: 'hassaniya_pending',
  EXCLUDED: 'hassaniya_excluded',
  CONVERSATION_FEEDBACK: 'hassaniya_conversation_feedback',
  CUSTOM_INSTRUCTIONS: 'hassaniya_custom_instructions',
  REPLACEMENTS: 'hassaniya_replacements',
  PENDING_EXCLUSIONS: 'hassaniya_pending_exclusions',
  KNOWLEDGE_BASE: 'hassaniya_knowledge_base',
  USER_STYLE_PROFILE: 'hassaniya_user_style_profile',
};

export const PARTS_OF_SPEECH_OPTIONS = Object.values(PartOfSpeech);

export const ANALYSIS_MODES = {
  [AnalysisMode.Confirmed]: {
    name: 'تحليل مؤكد',
    description: 'يستخرج الكلمات الحسانية المؤكدة فقط، ويتعلم من قاعدة البيانات الحالية.'
  },
  [AnalysisMode.NonMsa]: {
    name: 'استخراج غير الفصحى',
    description: 'يحدد أي كلمة لا تنتمي للعربية الفصحى.'
  },
  [AnalysisMode.All]: {
    name: 'استخراج كل الكلمات',
    description: 'يسرد كل كلمة فريدة في النص غير موجودة بالنظام (يعمل محلياً).'
  },
};

export interface GroundingSource {
  uri: string;
  title: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  rating?: 'good' | 'bad';
  sources?: GroundingSource[];
}

export interface ConversationFeedback {
  id: string;
  ratedMessageId: string;
  context: ChatMessage[];
  rating: 'good' | 'bad';
  timestamp: string;
  notes?: string;
}

export interface ReplacementRule {
  id: string;
  original: string;
  replacement: string; // Empty string means exclusion
}

export interface PendingExclusion {
  id: string;
  incorrectWord: string;
  suggestedReplacement: string;
  dateSuggested: string; // ISO String
}

export interface AnalyzedWord {
  hassaniya: string;
  arabic: string;
  context: string;
}

export interface KnowledgeDocument {
  id: string;
  fileName: string;
  content: string;
  dateAdded: string; // ISO String
}

export type ChatMode = 'standard' | 'database_only' | 'web_search' | 'knowledge_base';