import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env['Fit4Me_ANTHROPIC_API_KEY'] ?? '',
});

const SYSTEM = `You convert app flow descriptions into a structured outline format.

Output ONLY the outline text — no explanation, no markdown fences, no preamble.

Format rules:
- 2-space indent per level
- Root node (first line): Label [root]
- Navigation bar: Label [nav] | Tab1 · Tab2 · Tab3
- Tab/branch: Label [tab:branchId]  (branchId = short lowercase slug, e.g. plan, workouts)
- Regular screen or action: Label  OR  Label | short subtitle
- Keep labels short (1–5 words)

Example output:
Fit4Me [root]
  Navigation [nav] | Plan · Workouts · Fasting
    Plan [tab:plan]
      Dashboard
      Create Plan | AI-powered
    Workouts [tab:workouts]
      Workout List
      Start Workout
    Fasting [tab:fasting]
      Timer | 16:8
      History`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { text } = (req.body ?? {}) as { text?: string };
  if (!text) return res.status(400).json({ error: 'Missing text' });

  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      system: SYSTEM,
      messages: [{ role: 'user', content: `Convert this to outline format:\n\n${text}` }],
    });

    const block = message.content[0];
    const outline = block.type === 'text' ? block.text.trim() : '';
    if (!outline) return res.status(500).json({ error: 'Empty response from AI' });

    return res.status(200).json({ outline });
  } catch (e) {
    console.error('[parse]', e);
    return res.status(500).json({ error: String(e) });
  }
}
