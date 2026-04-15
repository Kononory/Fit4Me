import type { VercelRequest, VercelResponse } from '@vercel/node';

interface RawFrame { id: string; name: string; }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { frames } = req.body ?? {};
  if (!Array.isArray(frames) || frames.length === 0)
    return res.status(400).json({ error: 'Missing frames' });

  const geminiKey = process.env['Fit4Me_GEMINI_API_KEY'];
  if (!geminiKey) return res.status(500).json({ error: 'Gemini API key not configured' });

  const frameList = (frames as RawFrame[])
    .map(f => `- ${f.id}: "${f.name}"`)
    .join('\n');

  const prompt = `You are analyzing frames from a product/app design file. Group these frames into logical sections for an information architecture tree.

Frames (id: name):
${frameList}

Return JSON in this exact format:
{
  "groups": [
    { "name": "Group Name", "frameIds": ["id1", "id2"] }
  ]
}

Rules:
- Every frame must appear in exactly one group
- Group names should be concise (2-4 words)
- Order groups by natural user flow (onboarding before core features, core features before settings)
- If frame names contain a common prefix like "Login / 01 – Form", use that prefix as the group name
- Frames with no clear group go into a group named "Other"`;

  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    },
  );

  if (!r.ok) return res.status(502).json({ error: `Gemini: HTTP ${r.status}` });

  const body = await r.json() as { candidates: { content: { parts: { text: string }[] } }[] };
  const result = JSON.parse(body.candidates[0].content.parts[0].text) as {
    groups: { name: string; frameIds: string[] }[];
  };

  return res.status(200).json(result);
}
