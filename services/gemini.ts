
import { GoogleGenAI, Modality } from "@google/genai";
import { Task, User, Language } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- SINGLETON AUDIO POUR TABLETTE ---
let globalAudioCtx: AudioContext | null = null;

export const unlockAudio = async () => {
  if (!globalAudioCtx) {
    globalAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  }
  if (globalAudioCtx.state === 'suspended') {
    await globalAudioCtx.resume();
  }
  return globalAudioCtx;
};

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export const generateHouseholdBriefing = async (tasks: Task[], users: User[], lang: Language = 'fr', isMorningGreeting = false) => {
  const pendingTasks = tasks.filter(t => !t.isDone);
  const sosTasks = pendingTasks.filter(t => t.isSOS);
  const completedToday = tasks.filter(t => t.isDone && t.completedAt && new Date(t.completedAt).toDateString() === new Date().toDateString());

  const completionStats = users.map(u => ({
    name: u.name,
    count: completedToday.filter(t => t.completedBy.includes(u.id)).length
  })).sort((a, b) => b.count - a.count);

  const topPerformer = completionStats[0].count > 0 ? completionStats[0] : null;

  const prompt = lang === 'fr' 
    ? `Génère un résumé court et chaleureux pour le foyer en FRANÇAIS. 
      ${isMorningGreeting ? "C'est le premier briefing de la journée, commence par un 'Bonjour matinal' enthousiaste." : ""}
      Contexte actuel:
      - Tâches en attente: ${pendingTasks.length}.
      - Alertes SOS: ${sosTasks.length}.
      ${topPerformer ? `- Félicitations à ${topPerformer.name} qui a déjà fini ${topPerformer.count} tâches aujourd'hui !` : ""}
      Membres du foyer: ${users.map(u => u.name).join(' et ')}.
      Structure: Salutation, Félicitations si méritées, Priorités (SOS), Encouragement. 
      Style: Bref, complice (max 80 mots).`
    : `Generate a short and warm household briefing in ENGLISH. 
      ${isMorningGreeting ? "It's the first briefing of the day, start with an enthusiastic 'Morning greeting'." : ""}
      Current context:
      - Pending tasks: ${pendingTasks.length}.
      - SOS alerts: ${sosTasks.length}.
      ${topPerformer ? `- Congratulations to ${topPerformer.name} who already finished ${topPerformer.count} tasks today!` : ""}
      Household members: ${users.map(u => u.name).join(' and ')}.
      Structure: Greeting, Congratulations if deserved, Priorities (SOS), Encouragement. 
      Style: Brief, friendly (max 80 words).`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Gemini summary error:", error);
    return lang === 'fr' 
      ? "Bonjour ! Le foyer est en mouvement. Quelques tâches SOS demandent votre attention."
      : "Hello! The household is on the move. Some SOS tasks need your attention.";
  }
};

export const speakSummary = async (text: string, lang: Language = 'fr') => {
  try {
    const voiceName = lang === 'fr' ? 'Kore' : 'Zephyr';
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) return;

    // Récupération ou création du Singleton
    const audioCtx = await unlockAudio();
    
    const audioBuffer = await decodeAudioData(
      decode(base64Audio),
      audioCtx,
      24000,
      1,
    );
    
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);
    source.start();
    
    return new Promise((resolve) => {
      source.onended = () => {
        // On ne ferme JAMAIS le contexte global, on le garde prêt pour la prochaine fois
        resolve(true);
      };
    });
  } catch (error) {
    console.error("Gemini TTS error:", error);
  }
};
