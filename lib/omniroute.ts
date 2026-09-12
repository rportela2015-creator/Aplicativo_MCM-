import { GoogleGenAI } from '@google/genai';

const OMNIROUTE_URL = process.env.OMNIROUTE_URL || 'http://localhost:20128/v1/chat/completions';
const OMNIROUTE_API_KEY = process.env.OMNIROUTE_API_KEY || 'sk-local';

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function askOmniRoute(systemPrompt: string, userPrompt: string): Promise<any> {
  const payload = {
    model: 'auditor', // This can be anything if local gateway routes it
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
  };

  try {
    const response = await fetch(OMNIROUTE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OMNIROUTE_API_KEY}`
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`OmniRoute HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    return JSON.parse(content);

  } catch (error: any) {
    // If connection refused or fetch fails, fallback to Gemini API if available
    if (error.cause?.code === 'ECONNREFUSED' || error.message.includes('fetch failed')) {
      console.warn('OmniRoute local unreachable. Falling back to Gemini.');
      return askGeminiFallback(systemPrompt, userPrompt);
    }

    // In test environments, if fetch fails and there's no gemini key, return mock
    console.error('OmniRoute failed:', error);
    throw error;
  }
}

async function askGeminiFallback(systemPrompt: string, userPrompt: string): Promise<any> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set for fallback');
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-3.6-flash', // The requested fallback model
    contents: [
      { role: 'user', parts: [{ text: systemPrompt + '\n\n' + userPrompt }] }
    ],
    config: {
      responseMimeType: 'application/json',
    }
  });

  const text = typeof response.text === 'function' ? (response as any).text() : response.text;
  return JSON.parse(text);
}