export interface TTSOptions {
  voice?: string;
  speed?: number;
  format?: 'mp3' | 'wav' | 'aac';
  quality?: 'low' | 'medium' | 'high';
}

export interface TTSResult {
  audioUrl: string;
  duration: number;
  format: string;
  size: number;
  provider: string;
}

export interface TTSProvider {
  name: string;
  synthesize(text: string, options?: TTSOptions): Promise<TTSResult>;
}


