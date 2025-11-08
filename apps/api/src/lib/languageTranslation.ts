/**
 * Comprehensive Language Translation Utility
 * Uses Qwen3-VL-8B-Instruct for translation
 */

import { qwenInstruct, logQwenUsage, QwenPromptPayload } from '../lib/qwenClient';
import { LanguageInfo } from '../middleware/regionLanguage';

const LANGUAGE_NAMES: Record<string, string> = {
  'ar-SA': 'Arabic', 'ar-AE': 'Arabic', 'ar-EG': 'Arabic',
  'fr-FR': 'French', 'hi-IN': 'Hindi', 'es-ES': 'Spanish',
  'es-MX': 'Spanish', 'pt-PT': 'Portuguese', 'pt-BR': 'Portuguese',
  'de-DE': 'German', 'it-IT': 'Italian', 'zh-CN': 'Chinese (Simplified)',
  'ja-JP': 'Japanese', 'ko-KR': 'Korean', 'ru-RU': 'Russian',
  'tr-TR': 'Turkish', 'nl-NL': 'Dutch', 'sv-SE': 'Swedish',
  'pl-PL': 'Polish', 'da-DK': 'Danish', 'fi-FI': 'Finnish',
  'no-NO': 'Norwegian', 'id-ID': 'Indonesian', 'th-TH': 'Thai',
  'ms-MY': 'Malay', 'sw-KE': 'Swahili', 'yo-NG': 'Yoruba',
  'ig-NG': 'Igbo', 'ha-NG': 'Hausa', 'zu-ZA': 'Zulu',
  'af-ZA': 'Afrikaans', 'el-GR': 'Greek', 'en-IE': 'English',
  'en-GB': 'English', 'en-US': 'English',
};

export async function translateWithAI(
  text: string,
  targetLanguage: string,
  sourceLanguage: string = 'en-US'
): Promise<string> {
  if (targetLanguage === sourceLanguage || targetLanguage.startsWith(sourceLanguage.split('-')[0])) {
    return text;
  }
  if (targetLanguage === 'en-US' || targetLanguage.startsWith('en-')) {
    return text;
  }

  const targetLangName = LANGUAGE_NAMES[targetLanguage] || 'English';

  const prompt: QwenPromptPayload = {
    messages: [
      {
        role: 'system',
        content: `Translate to ${targetLangName} (${targetLanguage}). Maintain meaning, tone, formatting. Return only translated text.`,
      },
      { role: 'user', content: text },
    ],
    temperature: 0.3,
    max_tokens: Math.min(text.length * 3, 2000),
  };

  try {
    const response = await qwenInstruct(prompt);
    const translated = response.choices[0]?.message?.content?.trim() || text;
    await logQwenUsage(`Translate to ${targetLanguage}: ${text.substring(0, 100)}`, response);
    return translated;
  } catch (error) {
    console.error(`Translation failed (${targetLanguage}):`, error);
    return text;
  }
}

export async function translateCaptions(
  captions: Array<{ timestamp: number; text: string }>,
  targetLanguage: string
): Promise<Array<{ timestamp: number; text: string }>> {
  if (targetLanguage === 'en-US' || targetLanguage.startsWith('en-')) {
    return captions;
  }

  const translated: Array<{ timestamp: number; text: string }> = [];
  const batchSize = 10;
  
  for (let i = 0; i < captions.length; i += batchSize) {
    const batch = captions.slice(i, i + batchSize);
    const batchText = batch.map(c => c.text).join('\n');
    
    try {
      const translatedBatch = await translateWithAI(batchText, targetLanguage);
      const translatedLines = translatedBatch.split('\n');
      
      batch.forEach((caption, idx) => {
        translated.push({
          timestamp: caption.timestamp,
          text: translatedLines[idx] || caption.text,
        });
      });
    } catch (error) {
      console.error('Batch translation failed:', error);
      batch.forEach(caption => translated.push(caption));
    }
  }

  return translated;
}

export function generateLanguageMetadata(languageInfo: LanguageInfo): {
  resolved_language: string;
  source: string;
  fallback_used: boolean;
} {
  return {
    resolved_language: languageInfo.resolved_language,
    source: languageInfo.source,
    fallback_used: languageInfo.fallback_used,
  };
}

