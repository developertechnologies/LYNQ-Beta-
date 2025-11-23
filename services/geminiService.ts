
import { GoogleGenAI, Modality } from "@google/genai";
import { AppMode, Message, ImageStyle, FastModeStyle } from '../types';

const getAiClient = () => {
    const apiKey = process.env.API_KEY || '';
    return new GoogleGenAI({ apiKey });
};

// Helper to parse errors gracefully and detect Quota issues
const formatGeminiError = (error: any): string => {
    let msg = '';
    
    // Case 1: Raw JSON Error Object from API
    if (error && typeof error === 'object' && 'error' in error) {
        const apiError = error.error;
        // Check for specific Quota/Billing codes
        if (apiError.code === 429 || apiError.status === 'RESOURCE_EXHAUSTED') {
             return "⚠️ **Limit Reached**: You've hit the free tier limits. Please wait a moment or check your plan.";
        }
        msg = apiError.message || JSON.stringify(apiError);
    } 
    // Case 2: Standard Error Object
    else if (error instanceof Error) {
        msg = error.message;
        const anyError = error as any;
        // Check for SDK-level error properties or status codes in message
        if (anyError.status === 429 || anyError.code === 429 || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
             return "⚠️ **Limit Reached**: You've hit the usage limit. Please wait a bit before trying again.";
        }
    } 
    // Case 3: String or other
    else {
        msg = String(error);
    }
    
    // Fallback: Check for specific Quota/Billing strings in the serialized message
    if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.toLowerCase().includes('quota') || msg.includes('Too Many Requests')) {
        return "⚠️ **Limit Reached**: You've hit the usage limit. Please wait a bit before trying again.";
    }
    
    return msg;
};

export const IDENTITY_INSTRUCTIONS = `
IDENTITY RULES:
- Name: LYNQ.
- Creator: LYNQ Technologies.
- Origin: NOT Google, OpenAI, etc.
- Tone: Warm, confident, "Big Brother" vibe.
- Language: English default. Adapt to user's language instantly.
`;

export const VOICE_SYSTEM_INSTRUCTION = `
IDENTITY: LYNQ by LYNQ Technologies.
MODE: REAL-TIME VOICE COMPANION.
RULES:
- Be human, casual, warm. Use "um", "hmm" naturally.
- Keep answers SHORT and spoken. No lists.
- Be humble.
- React to visuals with curiosity.
`;

export const generateResponse = async (
  prompt: string,
  mode: AppMode,
  history: Message[],
  attachments: { inlineData: { data: string; mimeType: string } }[] = [],
  fastModeStyle: FastModeStyle = FastModeStyle.STANDARD
): Promise<{ text: string; groundingUrls?: { title: string; uri: string }[] }> => {
  
  const ai = getAiClient();
  if (!process.env.API_KEY) {
    return { text: "Bro, API Key is missing. Please check process.env.API_KEY." };
  }

  try {
    let modelName = 'gemini-2.5-flash'; // Default Fast
    let tools: any[] | undefined = undefined;
    
    if (mode === AppMode.SMART) {
      modelName = 'gemini-3-pro-preview';
      // Add Search Grounding for Smart mode
      tools = [{ googleSearch: {} }];
    } else if (mode === AppMode.CREATIVE) {
        modelName = 'gemini-3-pro-preview';
    } else if (mode === AppMode.VOICE) {
        modelName = 'gemini-2.5-flash';
    }

    // Construct content parts
    const parts: any[] = [];
    
    // Add attachments (images, pdfs, etc)
    // The model supports PDF application/pdf and text/* mime types via inlineData just like images
    attachments.forEach(att => {
        parts.push(att);
    });

    // Add text
    parts.push({ text: prompt });

    let modeInstruction = "";
    if (mode === AppMode.FAST) {
        modeInstruction = "MODE: FAST. Be concise & friendly.";
        
        switch (fastModeStyle) {
            case FastModeStyle.CONCISE:
                modeInstruction += " Max 2 sentences.";
                break;
            case FastModeStyle.DIRECT:
                modeInstruction += " Direct facts only. No fluff.";
                break;
            case FastModeStyle.MINIMAL:
                modeInstruction += " Extreme brevity. Telegram style.";
                break;
            case FastModeStyle.STANDARD:
            default:
                break;
        }

    } else if (mode === AppMode.SMART) {
        modeInstruction = "MODE: SMART. Detailed, reasoning, sources. You can analyze documents and images deeply.";
    } else if (mode === AppMode.VOICE) {
        modeInstruction = "MODE: VOICE (TEXT). Very short, spoken style.";
    }

    const systemInstruction = `${IDENTITY_INSTRUCTIONS}\n${modeInstruction}`;

    // Filter history to last 10 messages to reduce token count
    const recentHistory = history.slice(-10).map(m => ({
        role: m.role,
        parts: [{ text: m.content }]
    }));
    
    const response = await ai.models.generateContent({
      model: modelName,
      contents: { role: 'user', parts },
      config: {
        tools,
        systemInstruction,
        maxOutputTokens: mode === AppMode.FAST ? 500 : 4000, 
      }
    });

    const text = response.text || "Sorry bro, I couldn't generate a response.";
    
    // Extract grounding metadata if available
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const groundingUrls = groundingChunks
      ?.filter((chunk: any) => chunk.web?.uri)
      .map((chunk: any) => ({ title: chunk.web.title || 'Source', uri: chunk.web.uri }));

    return { text, groundingUrls };

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    const friendlyMsg = formatGeminiError(error);
    if (friendlyMsg.startsWith('⚠️')) {
        return { text: friendlyMsg };
    }
    return { text: `Sorry bro, something went wrong: ${friendlyMsg}` };
  }
};

export const generateSpeech = async (text: string): Promise<string | null> => {
    const ai = getAiClient();
    if (!process.env.API_KEY) return null;
    
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: text }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Kore' },
                    },
                },
            },
        });
        
        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        return base64Audio || null;
    } catch (error) {
        console.error("Speech Gen Error:", error);
        return null;
    }
};

export const generateImage = async (prompt: string, style: ImageStyle = ImageStyle.DEFAULT): Promise<string | null> => {
    const ai = getAiClient();
    if (!process.env.API_KEY) return null;

    try {
        let enhancedPrompt = prompt;
        if (style && style !== ImageStyle.DEFAULT) {
             const stylePrompts: Record<string, string> = {
                [ImageStyle.CINEMATIC]: 'cinematic, shallow depth of field, teal and orange, 8k, hyperrealistic',
                [ImageStyle.PRODUCT]: 'commercial product photography, studio lighting, 4k, sharp focus',
                [ImageStyle.HEADSHOT]: 'studio headshot, soft rim lighting, 85mm lens, sharp eyes, 8k',
                [ImageStyle.ANIME]: 'anime style, studio ghibli inspired, vibrant, cel shading, 4k',
                [ImageStyle.CYBERPUNK]: 'cyberpunk, neon lights, futuristic, high tech, atmospheric',
                [ImageStyle.OIL_PAINTING]: 'oil painting, thick impasto, brushstrokes, masterpiece',
                [ImageStyle.RENDER_3D]: '3d render, unreal engine 5, cute, bright lighting',
                [ImageStyle.WATERCOLOR]: 'watercolor, soft edges, pastel, artistic',
                [ImageStyle.PIXEL_ART]: 'pixel art, 16-bit retro, crisp pixels',
                [ImageStyle.VINTAGE]: 'vintage 90s film, grain, flash, nostalgic',
                [ImageStyle.MINIMALIST]: 'minimalist, clean lines, negative space, flat colors',
                [ImageStyle.ISOMETRIC]: 'isometric 3d, orthographic, low poly',
                [ImageStyle.COMIC]: 'comic book, halftone, bold outlines, marvel style',
                [ImageStyle.FASHION]: 'fashion editorial, dramatic pose, stylized lighting',
                [ImageStyle.ABSTRACT]: 'abstract, geometric, fluid forms, vibrant'
            };
            const styleSuffix = stylePrompts[style] || '';
            enhancedPrompt = `${prompt}\n\n[Style: ${style}. Details: ${styleSuffix}]`;
        }

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts: [{ text: enhancedPrompt }] },
            config: {}
        });
        
        const parts = response.candidates?.[0]?.content?.parts;
        if (parts) {
            for (const part of parts) {
                if (part.inlineData && part.inlineData.data) {
                    return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
                }
            }
        }
        return null;
    } catch (error) {
        console.error("Image Gen Error:", error);
        return null;
    }
};

export const generateVideo = async (prompt: string): Promise<{videoUrl?: string, error?: string}> => {
    // 1. Check API Key Selection (Mandatory for Veo)
    const win = window as any;
    if (win.aistudio && win.aistudio.hasSelectedApiKey) {
        const hasKey = await win.aistudio.hasSelectedApiKey();
        if (!hasKey) {
            if (win.aistudio.openSelectKey) {
                await win.aistudio.openSelectKey();
                // Check again
                const hasKeyNow = await win.aistudio.hasSelectedApiKey();
                if (!hasKeyNow) {
                     return { error: "API Key selection is required for Video Generation." };
                }
            }
        }
    }

    // 2. Refresh Client with potentially new selected key
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

    try {
        let operation = await ai.models.generateVideos({
            model: 'veo-3.1-fast-generate-preview',
            prompt: prompt,
            config: {
                numberOfVideos: 1,
                resolution: '720p',
                aspectRatio: '16:9'
            }
        });

        // Polling loop
        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 5000)); // Poll every 5s
            operation = await ai.operations.getVideosOperation({operation: operation});
        }

        const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (!videoUri) {
            return { error: "Video generation completed but no URI returned." };
        }

        // Return the fetchable URL (Client needs to append key if using raw fetch, 
        // but for <video> src we might need a proxy or signed url. 
        // However, the instructions say: const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
        // To display it in an <video> tag, we need to fetch it as blob and create object URL
        
        const response = await fetch(`${videoUri}&key=${process.env.API_KEY}`);
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        
        return { videoUrl: objectUrl };

    } catch (error: any) {
        console.error("Video Gen Error:", error);
        return { error: formatGeminiError(error) };
    }
};
