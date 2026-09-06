/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, ChangeEvent } from 'react';
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { 
  CloudUpload, 
  Languages, 
  Mic2, 
  Captions, 
  Bolt, 
  CheckCircle2, 
  XCircle, 
  Music, 
  Info,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---
interface TranscriptionResult {
  hook: string;
  content: string;
}

type Tone = 'natural' | 'formal' | 'slang';
type VoiceTone = 'professional' | 'excited' | 'whisper' | 'serious' | 'friendly' | 'fast' | 'slow' | 'dramatic';

// --- Constants ---
const SYSTEM_PROMPTS = {
  transcription: `မင်းက ကျွမ်းကျင်တဲ့ Transcriptionist တစ်ယောက်ဖြစ်တယ်။ ပေးထားတဲ့ Video/Audio ဖိုင်ထဲက စကားပြောတွေကို ကြားရတဲ့အတိုင်း စာသားအဖြစ် တိကျစွာ ပြောင်းပေးရမယ်။
                  အပိုဆောင်းတာဝန်: စာသားတွေရဲ့ အစမှာ စာဖတ်သူ/ကြည့်ရှုသူကို ဆွဲဆောင်နိုင်မယ့် "Hook" တစ်ခုကို မြန်မာလို သီးသန့်ထုတ်ပေးပါ။
                  စာသား Format ကို JSON အနေနဲ့ပေးပါ: { "hook": "ဆွဲဆောင်မှုရှိတဲ့ ခေါင်းစဉ်", "content": "မူရင်းစကားပြော စာသားများ..." }
                  * ဘာသာစကား: မြန်မာစကား သို့မဟုတ် အင်္ဂလိပ်စကား (ကြားရတဲ့အတိုင်း)။
                  * သတ်ပုံ: မြန်မာစာလုံးပေါင်း သတ်ပုံကို မှန်ကန်အောင် ရေးသားပါ။
                  * Format: စကားပြောသူ တစ်ဦးထက်ပိုရင် (Speaker 1, Speaker 2) စသဖြင့် ခွဲခြားပေးပါ။`,
  translation: (tone: string) => `မင်းက အင်္ဂလိပ်-မြန်မာ ဘာသာပြန် ကျွမ်းကျင်သူ ဖြစ်တယ်။ ပေးထားတဲ့ စာသားတွေကို မြန်မာဘာသာသို့ ပြန်ဆိုပေးပါ။
                လေသံအမျိုးအစား: ${tone}။
                * ပုံစံ: တိုက်ရိုက် ဘာသာပြန်ခြင်းထက် မြန်မာစကားပြော အသုံးအနှုန်းအတိုင်း သဘာဝကျကျ ဖြစ်အောင် ပြန်ဆိုပါ။
                * Context: Content creator များအတွက် ဖြစ်တဲ့အတွက် ကြည့်ရှုသူ နားလည်လွယ်မယ့် စကားလုံးများကို ရွေးချယ်ပါ။
                * ထိန်းသိမ်းရန်: နည်းပညာအခေါ်အဝေါ် သို့မဟုတ် အမည်နာမ (Proper Nouns) များကို လိုအပ်ပါက အင်္ဂလိပ်လိုအတိုင်း ထားရှိပါ။`,
  tts: (tone: string) => `မင်းက အသံသရုပ်ဆောင် (Voice Artist) တစ်ယောက်ဖြစ်တယ်။ ပေးထားတဲ့ မြန်မာစာသားကို အသံထွက်ဖတ်ဖို့အတွက် ပြင်ဆင်ပေးပါ။
        မင်းရဲ့ လေသံက: ${tone} ဖြစ်ရမယ်။
        * အဖြတ်အတောက်: စာကြောင်းအလိုက် အဖြတ်အတောက် မှန်ကန်ပါစေ။ အာမေဍိတ် (Exclamation) နဲ့ မေးခွန်းသင်္ကေတတွေမှာ လေသံအနိမ့်အမြင့် ပါဝင်ပါစေ။`
};

// --- Utilities ---
function pcmToWav(base64: string, rate: number): Blob {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const buffer = bytes.buffer;

  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const writeStr = (off: number, s: string) => { 
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); 
  };

  writeStr(0, 'RIFF'); 
  view.setUint32(4, 36 + buffer.byteLength, true); 
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt '); 
  view.setUint32(16, 16, true); 
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, rate, true); 
  view.setUint32(28, rate * 2, true); // Byte rate (rate * channels * bitsPerSample / 8)
  view.setUint16(32, 2, true); // Block align (channels * bitsPerSample / 8)
  view.setUint16(34, 16, true); // Bits per sample
  writeStr(36, 'data');
  view.setUint32(40, buffer.byteLength, true);

  return new Blob([header, buffer], { type: 'audio/wav' });
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [transcription, setTranscription] = useState<TranscriptionResult | null>(null);
  const [translation, setTranslation] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<{ show: boolean; title: string; msg: string; type: 'loading' | 'success' | 'error' }>({
    show: false,
    title: '',
    msg: '',
    type: 'loading'
  });

  const [translationTone, setTranslationTone] = useState<Tone>('natural');
  const [voice, setVoice] = useState('Kore');
  const [voiceTone, setVoiceTone] = useState<VoiceTone>('professional');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  const showStatus = (title: string, msg: string, type: 'loading' | 'success' | 'error' = 'loading') => {
    setLoading({ show: true, title, msg, type });
  };

  const hideStatus = () => {
    setLoading(prev => ({ ...prev, show: false }));
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const runTranscription = async () => {
    if (!file) {
      showStatus('အမှား', 'ဖိုင်အရင်တင်ပေးပါ', 'error');
      return;
    }

    showStatus('Processing', 'Video မှ စာသားပြောင်းနေပါသည်...');

    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        try {
          const base64Data = (reader.result as string).split(',')[1];
          const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: [{
              parts: [
                { text: "ဗီဒီယိုမှ စာသားကို ခွဲထုတ်ပြီး JSON format ဖြင့် ပေးပါ။" },
                { inlineData: { mimeType: file.type, data: base64Data } }
              ]
            }],
            config: {
              systemInstruction: SYSTEM_PROMPTS.transcription,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  hook: { type: Type.STRING },
                  content: { type: Type.STRING }
                },
                required: ["hook", "content"]
              }
            }
          });

          const data = JSON.parse(response.text);
          setTranscription(data);
          hideStatus();
        } catch (err) {
          console.error(err);
          showStatus('အမှား', 'စာသားပြောင်းရာတွင် အဆင်မပြေပါ', 'error');
        }
      };
    } catch (err) {
      console.error(err);
      showStatus('အမှား', 'ဖိုင်ဖတ်ရာတွင် အဆင်မပြေပါ', 'error');
    }
  };

  const runTranslation = async () => {
    if (!transcription?.content) {
      showStatus('အမှား', 'ဘာသာပြန်ရန် စာသားမရှိပါ', 'error');
      return;
    }

    showStatus('Translating', 'မြန်မာဘာသာသို့ ပြန်ဆိုနေပါသည်...');
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ parts: [{ text: transcription.content }] }],
        config: {
          systemInstruction: SYSTEM_PROMPTS.translation(translationTone)
        }
      });

      setTranslation(response.text);
      hideStatus();
    } catch (err) {
      console.error(err);
      showStatus('အမှား', 'ဘာသာပြန်၍ မရပါ', 'error');
    }
  };

  const runTTS = async () => {
    if (!translation) {
      showStatus('အမှား', 'အသံထုတ်ရန် စာသားမရှိပါ', 'error');
      return;
    }

    showStatus('Generating Audio', 'AI အသံဖန်တီးနေပါသည်...');
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Say this in a ${voiceTone} tone: ${translation}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice }
            }
          }
        }
      });

      const audioPart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
      if (audioPart?.inlineData) {
        const pcmData = audioPart.inlineData.data;
        const mimeType = audioPart.inlineData.mimeType;
        const rateMatch = mimeType.match(/rate=(\d+)/);
        const sampleRate = rateMatch ? parseInt(rateMatch[1]) : 24000;

        const blob = pcmToWav(pcmData, sampleRate);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        hideStatus();
        
        // Auto play
        setTimeout(() => {
          if (audioRef.current) {
            audioRef.current.play();
          }
        }, 100);
      } else {
        throw new Error("No audio data received");
      }
    } catch (err) {
      console.error(err);
      showStatus('အမှား', 'အသံထုတ်၍ မရပါ', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 md:p-8">
      <div className="max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <h1 className="text-3xl font-extrabold text-blue-700">AI Content Suite Ultra</h1>
            <p className="text-slate-500">Video မှ Content ဖန်တီးမှုအထိ အဆင့်မြှင့်တင်ပါ</p>
          </motion.div>
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white px-4 py-2 rounded-full shadow-sm border border-slate-200 text-xs font-medium text-slate-600 flex items-center"
          >
            <Bolt className="w-3 h-3 text-yellow-500 mr-1" /> Gemini 3 Flash Powered
          </motion.div>
        </div>

        {/* Main Tools Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Step 1: Transcription */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white/90 backdrop-blur-sm p-6 rounded-3xl shadow-lg border border-white flex flex-col hover:-translate-y-1 transition-transform"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <div className="bg-blue-100 text-blue-600 w-10 h-10 rounded-2xl flex items-center justify-center mr-3">
                  <Captions className="w-6 h-6" />
                </div>
                <h2 className="text-lg font-bold">Transcription</h2>
              </div>
            </div>

            {/* Hook Section */}
            <AnimatePresence>
              {transcription?.hook && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-xl overflow-hidden"
                >
                  <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Hook / Headline</span>
                  <p className="text-sm font-bold text-blue-900">{transcription.hook}</p>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-400 mb-2 uppercase">ဗီဒီယို သို့မဟုတ် အသံဖိုင်</label>
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="relative border-2 border-dashed border-slate-200 rounded-2xl p-4 text-center hover:border-blue-400 transition-colors cursor-pointer"
              >
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="video/*,audio/*" 
                  className="hidden" 
                />
                <CloudUpload className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs text-slate-500 truncate">
                  {file ? file.name : "ဖိုင်ရွေးချယ်ပါ"}
                </p>
              </div>
            </div>

            <button 
              onClick={runTranscription}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-2xl shadow-md transition-colors active:scale-[0.98]"
            >
              စာသားပြောင်းမည်
            </button>

            <textarea 
              value={transcription?.content || ''}
              onChange={(e) => setTranscription(prev => prev ? { ...prev, content: e.target.value } : { hook: '', content: e.target.value })}
              placeholder="စာသားများ ဤနေရာတွင် ပေါ်လာမည်..." 
              className="mt-4 flex-grow w-full p-4 border-none bg-slate-100 rounded-2xl text-sm min-h-[250px] focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            />
          </motion.div>

          {/* Step 2: Translation */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white/90 backdrop-blur-sm p-6 rounded-3xl shadow-lg border border-white flex flex-col hover:-translate-y-1 transition-transform"
          >
            <div className="flex items-center mb-4">
              <div className="bg-purple-100 text-purple-600 w-10 h-10 rounded-2xl flex items-center justify-center mr-3">
                <Languages className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold">Translation</h2>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-400 mb-2 uppercase">ဘာသာပြန်ဆိုမှု ပုံစံ</label>
              <select 
                value={translationTone}
                onChange={(e) => setTranslationTone(e.target.value as Tone)}
                className="w-full p-3 bg-slate-100 border-none rounded-xl text-sm outline-none"
              >
                <option value="natural">သဘာဝကျကျ (Natural Flow)</option>
                <option value="formal">ယဉ်ကျေးစွာ (Formal)</option>
                <option value="slang">စကားပြော (Friendly/Slang)</option>
              </select>
            </div>

            <button 
              onClick={runTranslation}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-2xl shadow-md transition-colors active:scale-[0.98]"
            >
              မြန်မာလို ပြန်မည်
            </button>

            <textarea 
              value={translation}
              onChange={(e) => setTranslation(e.target.value)}
              placeholder="ဘာသာပြန်စာသားများ..." 
              className="mt-4 flex-grow w-full p-4 border-none bg-slate-100 rounded-2xl text-sm min-h-[250px] focus:ring-2 focus:ring-purple-500 outline-none resize-none"
            />
          </motion.div>

          {/* Step 3: Text-to-Speech */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white/90 backdrop-blur-sm p-6 rounded-3xl shadow-lg border border-white flex flex-col hover:-translate-y-1 transition-transform"
          >
            <div className="flex items-center mb-4">
              <div className="bg-green-100 text-green-600 w-10 h-10 rounded-2xl flex items-center justify-center mr-3">
                <Mic2 className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold">AI Voice Studio</h2>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">အသံရွေးချယ်ရန်</label>
                <select 
                  value={voice}
                  onChange={(e) => setVoice(e.target.value)}
                  className="w-full p-2 bg-slate-100 border-none rounded-lg text-xs outline-none"
                >
                  <option value="Kore">Kore (Male - Strong)</option>
                  <option value="Puck">Puck (Cheerful)</option>
                  <option value="Charon">Charon (Deep)</option>
                  <option value="Fenrir">Fenrir (Professional)</option>
                  <option value="Zephyr">Zephyr (Relaxed)</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">လေသံ (Tone)</label>
                <select 
                  value={voiceTone}
                  onChange={(e) => setVoiceTone(e.target.value as VoiceTone)}
                  className="w-full p-2 bg-slate-100 border-none rounded-lg text-xs outline-none"
                >
                  <option value="professional">Professional</option>
                  <option value="excited">Excited</option>
                  <option value="whisper">Whisper</option>
                  <option value="serious">Serious</option>
                  <option value="friendly">Friendly</option>
                  <option value="fast">Fast & Energetic</option>
                  <option value="slow">Slow & Calm</option>
                  <option value="dramatic">Dramatic</option>
                </select>
              </div>
            </div>

            <button 
              onClick={runTTS}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-2xl shadow-md transition-colors active:scale-[0.98]"
            >
              အသံထုတ်မည်
            </button>

            <AnimatePresence>
              {audioUrl && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="mt-6 p-4 bg-white border border-slate-100 rounded-2xl shadow-inner"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-400">Ready to play</span>
                    <Music className="w-4 h-4 text-green-500 animate-pulse" />
                  </div>
                  <audio ref={audioRef} src={audioUrl} controls className="w-full h-10" />
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-auto pt-6 text-[11px] text-slate-400 italic leading-relaxed flex items-start">
              <Info className="w-3 h-3 mr-1 mt-0.5 flex-shrink-0" /> 
              <span>အသံသရုပ်ဆောင်၏ လေသံသည် ရွေးချယ်ထားသော Tone ပေါ်မူတည်၍ အလိုအလျောက် ပြောင်းလဲပေးပါမည်။</span>
            </div>
          </motion.div>

        </div>
      </div>

      {/* Status Overlay */}
      <AnimatePresence>
        {loading.show && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white p-8 rounded-3xl shadow-2xl text-center max-w-sm w-full"
            >
              <div className="mb-4 flex justify-center">
                {loading.type === 'loading' && <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />}
                {loading.type === 'success' && <CheckCircle2 className="w-10 h-10 text-green-500" />}
                {loading.type === 'error' && <XCircle className="w-10 h-10 text-red-500" />}
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">{loading.title}</h3>
              <p className="text-sm text-slate-500 mb-6">{loading.msg}</p>
              {loading.type !== 'loading' && (
                <button 
                  onClick={hideStatus}
                  className="w-full bg-slate-100 hover:bg-slate-200 py-3 rounded-xl font-bold text-slate-700 transition-colors"
                >
                  ပိတ်မည်
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
