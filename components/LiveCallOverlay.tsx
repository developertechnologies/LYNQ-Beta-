import React, { useEffect, useRef, useState } from 'react';
import { X, Mic, MicOff, PhoneOff, Settings2, Video, VideoOff, SwitchCamera, ChevronDown, RefreshCw } from 'lucide-react';
import { GoogleGenAI, LiveServerMessage, Modality, Blob as GenAIBlob } from "@google/genai";
import { LiveVoice } from '../types';
import { VOICE_SYSTEM_INSTRUCTION } from '../services/geminiService';
import { playUISound } from '../utils/sound';

interface LiveCallOverlayProps {
  onClose: () => void;
}

const VOICE_DESCRIPTIONS: Record<string, string> = {
  [LiveVoice.Puck]: "Playful & Witty",
  [LiveVoice.Charon]: "Deep & Authoritative",
  [LiveVoice.Kore]: "Calm & Gentle",
  [LiveVoice.Fenrir]: "Energetic & Bold",
  [LiveVoice.Zephyr]: "Soft & Empathetic"
};

export const LiveCallOverlay: React.FC<LiveCallOverlayProps> = ({ onClose }) => {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState<'user' | 'environment'>('user');
  const [selectedVoice, setSelectedVoice] = useState<LiveVoice>(LiveVoice.Puck);
  const [audioLevel, setAudioLevel] = useState(0); 
  const [showVoiceSelector, setShowVoiceSelector] = useState(false);

  // Audio Contexts
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  // Input processing
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  // Video processing
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoIntervalRef = useRef<number | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);

  // Connection Management
  const currentSessionPromiseRef = useRef<Promise<any> | null>(null);
  const activeRef = useRef(true);

  // Helper: Base64 Encode
  const b64Encode = (bytes: Uint8Array) => {
      let binary = '';
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
  };

  // Helper: Base64 Decode
  const b64Decode = (base64: string) => {
      const binaryString = atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
  };

  // Helper: Create PCM Blob
  const createPcmBlob = (data: Float32Array): GenAIBlob => {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
        int16[i] = data[i] * 32768;
    }
    const bytes = new Uint8Array(int16.buffer);
    return {
        data: b64Encode(bytes),
        mimeType: 'audio/pcm;rate=16000'
    };
  };

  // Helper: Decode Audio Data
  const decodeAudioData = async (
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number,
    numChannels: number,
  ): Promise<AudioBuffer> => {
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
  };

  // Initialize
  useEffect(() => {
    activeRef.current = true;
    connect();

    return () => {
        activeRef.current = false;
        cleanup();
    };
  }, [selectedVoice]); 

  const cleanup = () => {
    // Close Session
    if (currentSessionPromiseRef.current) {
        currentSessionPromiseRef.current.then(session => {
             try { session.close(); } catch(e) { console.log("Session close error", e); }
        });
        currentSessionPromiseRef.current = null;
    }

    // Stop Media Streams
    if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
    }
    if (videoStreamRef.current) {
        videoStreamRef.current.getTracks().forEach(t => t.stop());
        videoStreamRef.current = null;
    }

    // Stop Audio Processing
    if (processorRef.current) {
        processorRef.current.disconnect();
        processorRef.current = null;
    }
    if (inputSourceRef.current) {
        inputSourceRef.current.disconnect();
        inputSourceRef.current = null;
    }
    if (analyserRef.current) {
        analyserRef.current.disconnect();
        analyserRef.current = null;
    }
    if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
    }

    // Stop Video Processing
    if (videoIntervalRef.current) {
        clearInterval(videoIntervalRef.current);
        videoIntervalRef.current = null;
    }

    // Close Audio Contexts
    if (inputAudioContextRef.current) {
        inputAudioContextRef.current.close();
        inputAudioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
        outputAudioContextRef.current.close();
        outputAudioContextRef.current = null;
    }

    // Stop all sources
    sourcesRef.current.forEach(source => {
        try { source.stop(); } catch (e) {}
    });
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  };

  const connect = async () => {
      try {
          if (!activeRef.current) return;
          setStatus('connecting');
          setErrorMessage('');

          // 1. Setup Audio Output
          if (!outputAudioContextRef.current) {
            outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
          }

          // 2. Setup Audio Input
          if (!inputAudioContextRef.current) {
             inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 16000});
          }

          // 3. Get Mic Stream
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          streamRef.current = stream;

          // 4. Initialize Gemini Live Client
          const apiKey = process.env.API_KEY || '';
          if (!apiKey) throw new Error("API Key Missing");

          const ai = new GoogleGenAI({ apiKey });

          const sessionPromise = ai.live.connect({
              model: 'gemini-2.5-flash-native-audio-preview-09-2025',
              config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } }
                },
                systemInstruction: VOICE_SYSTEM_INSTRUCTION
              },
              callbacks: {
                  onopen: () => {
                      console.log("Live Session Open");
                      if (activeRef.current) {
                          setStatus('connected');
                          playUISound('on');
                      }
                  },
                  onmessage: async (message: LiveServerMessage) => {
                      if (!activeRef.current) return;

                      // Handle Audio Output
                      const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                      if (base64Audio && outputAudioContextRef.current) {
                          try {
                            const ctx = outputAudioContextRef.current;
                            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                            
                            const audioBuffer = await decodeAudioData(
                                b64Decode(base64Audio),
                                ctx,
                                24000,
                                1
                            );
                            
                            const source = ctx.createBufferSource();
                            source.buffer = audioBuffer;
                            source.connect(ctx.destination);
                            
                            source.start(nextStartTimeRef.current);
                            nextStartTimeRef.current += audioBuffer.duration;
                            
                            sourcesRef.current.add(source);
                            source.onended = () => sourcesRef.current.delete(source);

                          } catch (e) {
                              console.error("Audio Decode Error", e);
                          }
                      }

                      // Handle Interruption
                      if (message.serverContent?.interrupted) {
                          sourcesRef.current.forEach(s => {
                              try { s.stop(); } catch(e){}
                          });
                          sourcesRef.current.clear();
                          if (outputAudioContextRef.current) {
                            nextStartTimeRef.current = outputAudioContextRef.current.currentTime;
                          }
                      }
                  },
                  onclose: () => {
                      console.log("Live Session Closed");
                      if (activeRef.current && status !== 'error') {
                          // Only reconnect if not explicitly closed by error
                          // But to prevent infinite loops on bad connections:
                          // setStatus('error');
                      }
                  },
                  onerror: (e) => {
                      console.error("Live Session Error", e);
                      if (activeRef.current) {
                          setStatus('error');
                          setErrorMessage("Connection failed. Check network or quota.");
                          playUISound('error');
                      }
                  }
              }
          });
          currentSessionPromiseRef.current = sessionPromise;

          // Catch immediate promise errors (like 429)
          sessionPromise.catch(e => {
              console.error("Session Promise Error:", e);
              if (activeRef.current) {
                  setStatus('error');
                  // Parse error message
                  const msg = e.message || String(e);
                  if (msg.includes('429') || msg.includes('quota')) {
                      setErrorMessage("Quota exceeded. Please check billing.");
                  } else {
                      setErrorMessage("Network error. Please retry.");
                  }
                  playUISound('error');
              }
          });

          // 5. Setup Input Processing (Sending Audio)
          const ctx = inputAudioContextRef.current;
          const source = ctx.createMediaStreamSource(stream);
          inputSourceRef.current = source;
          
          const processor = ctx.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;
          
          processor.onaudioprocess = (e) => {
              if (!isMicOn) return; 
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createPcmBlob(inputData);
              
              sessionPromise.then(session => {
                  try {
                      session.sendRealtimeInput({ media: pcmBlob });
                  } catch (e) {
                      // Session might be closed
                  }
              }).catch(() => {}); // Catch if session failed
          };

          // Analyzer for visualizer
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          analyser.connect(processor);
          processor.connect(ctx.destination);
          analyserRef.current = analyser;

          animateAudioLevel();

      } catch (e) {
          console.error("Connection Failed", e);
          setStatus('error');
          setErrorMessage("Failed to access microphone or network.");
          playUISound('error');
      }
  };

  const animateAudioLevel = () => {
      if (!analyserRef.current || !activeRef.current) return;
      
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);
      
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
      }
      const average = sum / dataArray.length;
      
      // Smoother dampening
      setAudioLevel(prev => prev * 0.85 + (average / 128) * 0.15);
      
      animationFrameRef.current = requestAnimationFrame(animateAudioLevel);
  };

  const toggleMic = () => {
      playUISound('click');
      setIsMicOn(!isMicOn);
  };

  const toggleVideo = async () => {
      playUISound('click');
      if (isVideoOn) {
          // Turn off
          if (videoStreamRef.current) {
              videoStreamRef.current.getTracks().forEach(t => t.stop());
              videoStreamRef.current = null;
          }
          if (videoIntervalRef.current) {
              clearInterval(videoIntervalRef.current);
              videoIntervalRef.current = null;
          }
          setIsVideoOn(false);
      } else {
          // Turn on
          try {
              const stream = await navigator.mediaDevices.getUserMedia({ 
                  video: { facingMode: cameraFacingMode, width: { ideal: 640 }, height: { ideal: 480 } } 
              });
              videoStreamRef.current = stream;
              if (videoRef.current) {
                  videoRef.current.srcObject = stream;
                  videoRef.current.play();
              }
              startSendingVideo();
              setIsVideoOn(true);
          } catch (e) {
              console.error("Camera access failed", e);
          }
      }
  };

  const startSendingVideo = () => {
      if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
      
      videoIntervalRef.current = window.setInterval(() => {
          if (!videoRef.current || !canvasRef.current || !currentSessionPromiseRef.current) return;
          
          const video = videoRef.current;
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');
          
          if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              ctx.drawImage(video, 0, 0);
              
              const base64 = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
              
              currentSessionPromiseRef.current.then(session => {
                  try {
                      session.sendRealtimeInput({ media: { mimeType: 'image/jpeg', data: base64 } });
                  } catch (e) { }
              }).catch(() => {});
          }
      }, 1000); 
  };

  const switchCamera = async () => {
      playUISound('click');
      if (!isVideoOn) return;
      setCameraFacingMode(prev => prev === 'user' ? 'environment' : 'user');
      
      if (videoStreamRef.current) {
          videoStreamRef.current.getTracks().forEach(t => t.stop());
      }
      try {
          const stream = await navigator.mediaDevices.getUserMedia({ 
              video: { facingMode: cameraFacingMode === 'user' ? 'environment' : 'user', width: { ideal: 640 }, height: { ideal: 480 } } 
          });
          videoStreamRef.current = stream;
          if (videoRef.current) {
              videoRef.current.srcObject = stream;
              videoRef.current.play();
          }
      } catch (e) {
          console.error("Switch camera failed", e);
      }
  };

  const handleRetry = () => {
      playUISound('click');
      cleanup();
      setTimeout(() => {
          activeRef.current = true;
          connect();
      }, 500);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-lynq-dark flex flex-col items-center justify-between p-6 animate-fade-in backdrop-blur-3xl">
      
      {/* Background Ambience */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-lynq-accent/20 rounded-full blur-[120px] transition-all duration-200 ease-out`} 
               style={{ transform: `translate(-50%, -50%) scale(${1 + audioLevel * 1.5})`, opacity: 0.2 + (audioLevel * 0.4) }} 
          />
      </div>

      {/* Header */}
      <div className="w-full max-w-lg flex items-center justify-between z-10 relative">
        <div className="flex items-center gap-3">
            <button onClick={() => { playUISound('click'); setShowVoiceSelector(!showVoiceSelector); }} className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm font-medium hover:bg-white/10 transition-colors backdrop-blur-md shadow-lg">
                <span>{selectedVoice}</span>
                <ChevronDown size={14} className={`transition-transform ${showVoiceSelector ? 'rotate-180' : ''}`} />
            </button>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-medium border backdrop-blur-md shadow-lg ${status === 'connected' ? 'bg-green-500/10 border-green-500/20 text-green-400' : status === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'}`}>
            {status === 'connected' ? 'Live' : status === 'error' ? 'Error' : 'Connecting...'}
        </div>
      </div>

      {/* Voice Selector Dropdown */}
      {showVoiceSelector && (
          <div className="absolute top-20 left-6 z-20 w-56 bg-[#121418]/95 border border-white/10 rounded-2xl shadow-glass overflow-hidden animate-slide-up backdrop-blur-2xl">
              {Object.keys(VOICE_DESCRIPTIONS).map((voice) => (
                  <button
                    key={voice}
                    onClick={() => {
                        playUISound('click');
                        setSelectedVoice(voice as LiveVoice);
                        setShowVoiceSelector(false);
                    }}
                    className={`w-full text-left px-4 py-3 text-sm transition-colors hover:bg-white/5 flex flex-col gap-0.5 ${selectedVoice === voice ? 'text-lynq-accent font-semibold bg-lynq-accent/5' : 'text-gray-300'}`}
                  >
                      <span>{voice}</span>
                      <span className="text-[10px] opacity-60 font-normal">{VOICE_DESCRIPTIONS[voice]}</span>
                  </button>
              ))}
          </div>
      )}

      {/* Main Visualizer Area */}
      <div className="flex-1 w-full max-w-lg flex flex-col items-center justify-center relative z-10">
         
         {/* Error Display */}
         {status === 'error' && (
             <div className="absolute top-10 w-full flex flex-col items-center animate-slide-down">
                 <div className="bg-red-500/10 border border-red-500/20 text-red-200 px-4 py-3 rounded-xl text-sm text-center backdrop-blur-md shadow-lg mb-4">
                     {errorMessage || "Connection failed."}
                 </div>
                 <button onClick={handleRetry} className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg text-sm transition-colors">
                     <RefreshCw size={14} /> Retry
                 </button>
             </div>
         )}

         {/* Video Preview */}
         <div className={`relative transition-all duration-700 cubic-bezier(0.16, 1, 0.3, 1) ${isVideoOn ? 'w-full aspect-[3/4] md:aspect-video rounded-[2rem] overflow-hidden border border-white/10 shadow-2xl mb-8 opacity-100 scale-100' : 'w-0 h-0 opacity-0 scale-95 overflow-hidden'}`}>
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
            <canvas ref={canvasRef} className="hidden" />
            <button onClick={switchCamera} className="absolute top-4 right-4 p-3 bg-black/40 backdrop-blur-md rounded-full text-white hover:bg-black/60 transition-colors border border-white/10">
                <SwitchCamera size={20} />
            </button>
         </div>

         {/* Audio Visualizer (Orb) */}
         {!isVideoOn && status !== 'error' && (
             <div className="relative w-64 h-64 flex items-center justify-center">
                 {/* Outer Rings */}
                 <div className="absolute inset-0 border border-lynq-accent/5 rounded-full animate-spin-slow" style={{ animationDuration: '10s' }}></div>
                 <div className="absolute inset-8 border border-lynq-accent/10 rounded-full animate-spin-slow" style={{ animationDirection: 'reverse', animationDuration: '15s' }}></div>
                 
                 {/* Glowing Core */}
                 <div className="w-40 h-40 rounded-full bg-gradient-to-br from-lynq-accent via-orange-400 to-amber-600 flex items-center justify-center shadow-glow-lg transition-transform duration-100 ease-out"
                      style={{ transform: `scale(${1 + (audioLevel * 0.4)})` }}
                 >
                    {status === 'connecting' ? (
                        <div className="w-12 h-12 border-2 border-lynq-dark border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <div className="w-full h-full rounded-full opacity-60 mix-blend-overlay bg-[url('https://grainy-gradients.vercel.app/noise.svg')] animate-pulse-slow" />
                    )}
                 </div>
             </div>
         )}
         
         <p className="mt-8 text-lg font-light tracking-wide text-white/80 animate-pulse text-center">
             {status === 'connecting' ? 'Connecting to neural network...' : status === 'error' ? '' : 'Listening...'}
         </p>
      </div>

      {/* Controls */}
      <div className="w-full max-w-lg grid grid-cols-4 gap-4 z-10">
        <button 
            onClick={toggleMic}
            className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl transition-all duration-300 group ${isMicOn ? 'bg-white/5 border border-white/5 text-white hover:bg-white/10' : 'bg-red-500/20 border border-red-500/20 text-red-400 hover:bg-red-500/30'}`}
        >
            {isMicOn ? <Mic size={24} className="group-hover:scale-110 transition-transform" /> : <MicOff size={24} />}
            <span className="text-[10px] font-medium tracking-wide">MIC</span>
        </button>

        <button 
            onClick={toggleVideo}
            className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl transition-all duration-300 group ${isVideoOn ? 'bg-white/10 border border-white/10 text-white hover:bg-white/20 shadow-glow' : 'bg-lynq-surface border border-white/5 text-gray-400 hover:bg-white/5 hover:text-white'}`}
        >
            {isVideoOn ? <Video size={24} className="group-hover:scale-110 transition-transform" /> : <VideoOff size={24} />}
            <span className="text-[10px] font-medium tracking-wide">CAMERA</span>
        </button>

        <button 
            className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-lynq-surface border border-white/5 text-gray-400 hover:bg-white/5 hover:text-white transition-all duration-300 group"
        >
            <Settings2 size={24} className="group-hover:rotate-45 transition-transform duration-500" />
            <span className="text-[10px] font-medium tracking-wide">CONFIG</span>
        </button>

        <button 
            onClick={() => { playUISound('off'); onClose(); }}
            className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-red-500 text-white hover:bg-red-600 transition-all duration-300 shadow-lg shadow-red-500/20 group hover:scale-105 active:scale-95"
        >
            <PhoneOff size={24} className="group-hover:rotate-12 transition-transform" />
            <span className="text-[10px] font-medium tracking-wide">END</span>
        </button>
      </div>

    </div>
  );
};