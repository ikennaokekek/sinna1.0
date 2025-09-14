import { AssemblyAI } from 'assemblyai';
import { CaptionsProvider, TranscriptionOptions, TranscriptionResult } from './types';

export class AssemblyAICaptionsProvider implements CaptionsProvider {
  public name = 'assemblyai';
  private client: AssemblyAI;

  constructor(apiKey: string) {
    this.client = new AssemblyAI({ apiKey });
  }

  async transcribe(audioUrl: string, options: TranscriptionOptions = {}): Promise<TranscriptionResult> {
    const transcript = await this.client.transcripts.transcribe({
      audio_url: audioUrl,
      language_code: options.language,
      word_timestamps: options.includeWordTimestamps || false,
      speaker_labels: options.includeSpeakerLabels || false,
      filter_profanity: options.filterProfanity || false,
      punctuate: true,
      format_text: true
    });

    if (transcript.status === 'error') {
      throw new Error(transcript.error || 'AssemblyAI transcription failed');
    }

    return {
      text: transcript.text || '',
      confidence: transcript.confidence || 0,
      language: transcript.language_code,
      segments: transcript.segments?.map(s => ({
        start: s.start / 1000,
        end: s.end / 1000,
        text: s.text,
        confidence: s.confidence
      })),
      words: options.includeWordTimestamps ? transcript.words?.map(w => ({
        start: w.start / 1000,
        end: w.end / 1000,
        text: w.text,
        confidence: w.confidence
      })) : undefined,
      provider: this.name
    };
  }
}


