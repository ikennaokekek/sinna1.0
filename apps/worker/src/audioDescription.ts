interface AudioDescriptionChatClient {
  chat: {
    completions: {
      create(input: {
        model: string;
        messages: Array<{ role: 'system' | 'user'; content: string }>;
        max_tokens: number;
      }): Promise<{ choices: Array<{ message?: { content?: string | null } }> }>;
    };
  };
}

export async function resolveAudioDescriptionText(
  openai: AudioDescriptionChatClient,
  explicitText: string | undefined,
  videoUrl: string | undefined,
): Promise<string> {
  if (explicitText) return explicitText;

  const chat = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are an accessibility audio description writer. Generate a brief, clear audio description introduction for a video. Keep it under 3 sentences. Be descriptive of what a viewer might see.',
      },
      {
        role: 'user',
        content: `Write a short audio description for this video: ${videoUrl || 'unknown video'}`,
      },
    ],
    max_tokens: 150,
  });
  const generated = chat.choices[0]?.message?.content?.trim();
  if (!generated) throw new Error('OpenAI chat returned no audio description text');
  return generated;
}