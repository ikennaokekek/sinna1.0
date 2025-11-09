/**
 * Qwen3-VL-8B-Instruct Analysis Functions for Sinna 1.0 Worker
 * 
 * Provides multimodal reasoning for accessibility analysis:
 * - Vision analysis (flash, color, motion)
 * - Audio/speech analysis (tone, context)
 * - Cognitive analysis (attention, overload)
 */

import { qwenInstruct, logQwenUsage, QwenPromptPayload, QwenResponse } from './qwenClient';

export interface VisionAnalysisResult {
  flashFrequency: number; // flashes per second
  colorConflicts: Array<{ timestamp: number; severity: 'low' | 'medium' | 'high'; description: string }>;
  motionIntensity: Array<{ timestamp: number; intensity: number; description: string }>;
  recommendations: string[];
}

export interface AudioAnalysisResult {
  toneLabels: Array<{ timestamp: number; tone: string; context: string }>;
  speakerCues: Array<{ timestamp: number; speaker: string; emotion?: string }>;
  enrichedSubtitles: Array<{ timestamp: number; text: string; tone?: string }>;
}

export interface CognitiveAnalysisResult {
  summaries: Array<{ scene: number; summary: string; bulletPoints: string[] }>;
  overloadFrames: Array<{ timestamp: number; reason: string; action: string }>;
  suggestions: Array<{ scene: number; action: string; reason: string }>;
}

/**
 * Vision Analysis for Blindness, Color-Blindness, Epilepsy
 * Analyzes video frames for flash frequency, color conflicts, motion intensity
 */
export async function analyzeVision(
  frameUrls: string[],
  timestamps: number[]
): Promise<VisionAnalysisResult> {
  const prompt: QwenPromptPayload = {
    messages: [
      {
        role: 'system',
        content: 'You are an accessibility analysis expert. Analyze video frames for flash frequency, color conflicts, and motion intensity. Return structured JSON.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Analyze these video frames (timestamps: ${timestamps.join(', ')}s) for:
1. Flash frequency (flashes per second)
2. Color conflicts (for color-blind users)
3. Motion intensity (0-10 scale)

Return JSON with:
{
  "flashFrequency": number,
  "colorConflicts": [{"timestamp": number, "severity": "low|medium|high", "description": string}],
  "motionIntensity": [{"timestamp": number, "intensity": number, "description": string}],
  "recommendations": [string]
}`,
          },
          ...frameUrls.map(url => ({
            type: 'image_url' as const,
            image_url: { url },
          })),
        ],
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
    max_tokens: 2000,
  };

  try {
    const response = await qwenInstruct(prompt);
    const content = response.choices[0]?.message?.content || '{}';
    const result = JSON.parse(content) as VisionAnalysisResult;
    
    await logQwenUsage(JSON.stringify(prompt.messages), response);
    
    return result;
  } catch (error) {
    console.error('Vision analysis failed:', error);
    // Return safe defaults
    return {
      flashFrequency: 0,
      colorConflicts: [],
      motionIntensity: [],
      recommendations: ['Analysis unavailable'],
    };
  }
}

/**
 * Audio & Speech Analysis for Deaf/Hard-of-Hearing
 * Analyzes transcribed audio for tone labels and contextual cues
 */
export async function analyzeAudio(
  transcriptChunks: Array<{ timestamp: number; text: string }>,
  frameTimestamps: number[]
): Promise<AudioAnalysisResult> {
  const prompt: QwenPromptPayload = {
    messages: [
      {
        role: 'system',
        content: 'You are an audio accessibility expert. Analyze transcribed audio for tone, emotion, and speaker context. Return structured JSON.',
      },
      {
        role: 'user',
        content: `Analyze these audio transcript chunks:
${transcriptChunks.map(c => `[${c.timestamp}s] ${c.text}`).join('\n')}

Return JSON with:
{
  "toneLabels": [{"timestamp": number, "tone": string, "context": string}],
  "speakerCues": [{"timestamp": number, "speaker": string, "emotion": string}],
  "enrichedSubtitles": [{"timestamp": number, "text": string, "tone": string}]
}`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
    max_tokens: 2000,
  };

  try {
    const response = await qwenInstruct(prompt);
    const content = response.choices[0]?.message?.content || '{}';
    const result = JSON.parse(content) as AudioAnalysisResult;
    
    await logQwenUsage(JSON.stringify(prompt.messages), response);
    
    return result;
  } catch (error) {
    console.error('Audio analysis failed:', error);
    return {
      toneLabels: [],
      speakerCues: [],
      enrichedSubtitles: transcriptChunks.map(c => ({ timestamp: c.timestamp, text: c.text })),
    };
  }
}

/**
 * Cognitive & Attention Analysis for ADHD, Autism, Cognitive Load
 * Analyzes dialogues and frames for overload and attention support
 */
export async function analyzeCognitive(
  dialogues: Array<{ timestamp: number; text: string }>,
  frameUrls: string[],
  timestamps: number[]
): Promise<CognitiveAnalysisResult> {
  const prompt: QwenPromptPayload = {
    messages: [
      {
        role: 'system',
        content: 'You are a cognitive accessibility expert. Analyze content for attention support, sensory overload, and simplification needs. Return structured JSON.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Analyze dialogues and frames:
Dialogues:
${dialogues.map(d => `[${d.timestamp}s] ${d.text}`).join('\n')}

Return JSON with:
{
  "summaries": [{"scene": number, "summary": string, "bulletPoints": [string]}],
  "overloadFrames": [{"timestamp": number, "reason": string, "action": string}],
  "suggestions": [{"scene": number, "action": "suggest_pause|simplify|highlight", "reason": string}]
}`,
          },
          ...frameUrls.map(url => ({
            type: 'image_url' as const,
            image_url: { url },
          })),
        ],
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
    max_tokens: 2000,
  };

  try {
    const response = await qwenInstruct(prompt);
    const content = response.choices[0]?.message?.content || '{}';
    const result = JSON.parse(content) as CognitiveAnalysisResult;
    
    await logQwenUsage(JSON.stringify(prompt.messages), response);
    
    return result;
  } catch (error) {
    console.error('Cognitive analysis failed:', error);
    return {
      summaries: [],
      overloadFrames: [],
      suggestions: [],
    };
  }
}

