export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  confidence: number;
}

export interface TranscriptionWord {
  start: number;
  end: number;
  text: string;
  confidence: number;
}

export interface TranscriptionOptions {
  language?: string;
  includeWordTimestamps?: boolean;
  includeSpeakerLabels?: boolean;
  filterProfanity?: boolean;
}

export interface TranscriptionResult {
  text: string;
  confidence: number;
  language?: string;
  segments?: TranscriptionSegment[];
  words?: TranscriptionWord[];
  provider: string;
}

export interface CaptionsProvider {
  name: string;
  transcribe(audioUrl: string, options?: TranscriptionOptions): Promise<TranscriptionResult>;
}


