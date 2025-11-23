
import React, { useState, useRef, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { InputBar } from './components/InputBar';
import { LiveCallOverlay } from './components/LiveCallOverlay';
import { AppMode, ChatSession, Message, MessageRole, Attachment, AttachmentType, ImageStyle, FastModeStyle } from './types';
import { generateResponse, generateImage, generateSpeech, generateVideo } from './services/geminiService';
import { Menu, Zap } from 'lucide-react';
import { playUISound } from './utils/sound';

const DEFAULT_SESSION_ID = 'default-session';

// Helper to decode base64 audio data
const decodeAudioData = async (base64Data: string, ctx: AudioContext) => {
    const binaryString = atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    const dataInt16 = new Int16Array(bytes.buffer);
    const numChannels = 1;
    const sampleRate = 24000;
    
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i] / 32768.0;
    }
    return buffer;
};

export default function App() {
  const [currentMode, setCurrentMode] = useState<AppMode>(AppMode.FAST);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLiveCallActive, setIsLiveCallActive] = useState(false);
  
  // Initialize sessions from localStorage or default
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      const saved = localStorage.getItem('lynq_sessions');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error("Failed to load sessions", e);
    }
    return [{
      id: DEFAULT_SESSION_ID,
      title: 'New Conversation',
      messages: [],
      lastUpdated: Date.now()
    }];
  });

  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
      if (sessions.length > 0) {
          return sessions[0].id; 
      }
      return DEFAULT_SESSION_ID;
  });
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationTime, setGenerationTime] = useState(0); 
  const [selectedImageStyle, setSelectedImageStyle] = useState<ImageStyle>(ImageStyle.DEFAULT);
  const [fastModeStyle, setFastModeStyle] = useState<FastModeStyle>(FastModeStyle.STANDARD);

  // Audio Context for Playback
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const currentSession = sessions.find(s => s.id === currentSessionId) || sessions[0] || {
      id: 'temp', title: 'New Chat', messages: [], lastUpdated: Date.now()
  };

  useEffect(() => {
    localStorage.setItem('lynq_sessions', JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    return () => {
        if (activeSourceRef.current) {
            activeSourceRef.current.stop();
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
        }
    };
  }, []);

  const createNewSession = () => {
    playUISound('click');
    const newId = Date.now().toString();
    const newSession: ChatSession = {
      id: newId,
      title: 'New Conversation',
      messages: [],
      lastUpdated: Date.now()
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newId);
    setSelectedImageStyle(ImageStyle.DEFAULT);
    setFastModeStyle(FastModeStyle.STANDARD);
    setIsSidebarOpen(false);
    
    if (activeSourceRef.current) {
        activeSourceRef.current.stop();
        activeSourceRef.current = null;
    }
  };

  const deleteSession = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      playUISound('click');
      setSessions(prev => {
          const filtered = prev.filter(s => s.id !== id);
          if (filtered.length === 0) {
              return [{
                  id: Date.now().toString(),
                  title: 'New Conversation',
                  messages: [],
                  lastUpdated: Date.now()
              }];
          }
          return filtered;
      });
      if (id === currentSessionId) {
          setCurrentSessionId(prev => {
               const remaining = sessions.filter(s => s.id !== id);
               return remaining.length > 0 ? remaining[0].id : DEFAULT_SESSION_ID;
          });
      }
  };

  const playAudio = async (base64Data: string) => {
    try {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
        }
        if (audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume();
        }
        if (activeSourceRef.current) {
            activeSourceRef.current.stop();
            activeSourceRef.current = null;
        }

        const buffer = await decodeAudioData(base64Data, audioContextRef.current);
        const source = audioContextRef.current.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContextRef.current.destination);
        source.start(0);
        activeSourceRef.current = source;
        source.onended = () => {
            activeSourceRef.current = null;
        };
    } catch (e) {
        console.error("Audio playback error:", e);
    }
  };

  const handleSendMessage = async (text: string, attachments: Attachment[]) => {
    playUISound('send');
    const newMessage: Message = {
      id: Date.now().toString(),
      role: MessageRole.USER,
      content: text,
      timestamp: Date.now(),
      attachments,
      modeUsed: currentMode
    };

    setSessions(prev => prev.map(s => {
      if (s.id === currentSessionId) {
        const isFirstMessage = s.messages.length === 0;
        const newTitle = isFirstMessage ? (text.slice(0, 30) + (text.length > 30 ? '...' : '')) : s.title;
        return {
          ...s,
          title: newTitle,
          messages: [...s.messages, newMessage],
          lastUpdated: Date.now()
        };
      }
      return s;
    }));

    setIsGenerating(true);
    setGenerationTime(0);
    const startTime = Date.now(); 
    
    const timerInterval = setInterval(() => {
      setGenerationTime(Date.now() - startTime);
    }, 100);

    const apiAttachments = attachments
      .filter(a => a.base64)
      .map(a => ({
        inlineData: {
          data: a.base64!.split(',')[1],
          mimeType: a.mimeType || 'application/pdf' // Default to pdf if unknown file, usually text/plain handled
        }
      }));

    const lowerText = text.toLowerCase();
    const isExplicitImageRequest = selectedImageStyle !== ImageStyle.DEFAULT;
    const isImplicitImageRequest = (lowerText.startsWith('generate image') || lowerText.startsWith('create an image') || lowerText.startsWith('draw a')) && attachments.length === 0;
    
    const shouldGenerateImage = isExplicitImageRequest || isImplicitImageRequest;
    const shouldGenerateVideo = currentMode === AppMode.VIDEO || (lowerText.includes('generate video') || lowerText.includes('create a video'));

    let aiResponseText = '';
    let aiGroundingUrls: { title: string; uri: string }[] | undefined = undefined;
    let generatedImageUrl: string | null = null;
    let generatedVideoUrl: string | null = null;
    let audioData: string | null = null;

    try {
      if (shouldGenerateVideo) {
          const res = await generateVideo(text);
          if (res.videoUrl) {
              generatedVideoUrl = res.videoUrl;
              aiResponseText = "Here is your generated video.";
          } else {
              aiResponseText = res.error || "Failed to generate video.";
          }
      } else if (shouldGenerateImage) {
         generatedImageUrl = await generateImage(text, selectedImageStyle);
         aiResponseText = generatedImageUrl ? `Here is the ${selectedImageStyle !== ImageStyle.DEFAULT ? selectedImageStyle.toLowerCase() : ''} image you requested.` : "Sorry, I couldn't generate that image.";
      } else {
         const response = await generateResponse(text, currentMode, currentSession.messages, apiAttachments, fastModeStyle);
         aiResponseText = response.text;
         aiGroundingUrls = response.groundingUrls;

         if (currentMode === AppMode.VOICE) {
             audioData = await generateSpeech(aiResponseText);
             if (audioData) {
                 playAudio(audioData);
             }
         }
      }
    } catch (e) {
      aiResponseText = "Sorry bhai, kuch technical issue aa gaya.";
    } finally {
      clearInterval(timerInterval);
    }

    const endTime = Date.now();
    const executionTime = endTime - startTime;

    const responseAttachments: Attachment[] = [];
    if (generatedImageUrl) responseAttachments.push({ type: AttachmentType.IMAGE, url: generatedImageUrl });
    if (generatedVideoUrl) responseAttachments.push({ type: AttachmentType.VIDEO, url: generatedVideoUrl });

    const aiMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: MessageRole.MODEL,
      content: aiResponseText,
      timestamp: Date.now(),
      isThinking: false,
      modeUsed: currentMode,
      groundingUrls: aiGroundingUrls,
      attachments: responseAttachments.length > 0 ? responseAttachments : undefined,
      executionTime: executionTime,
      audioData: audioData || undefined
    };

    setSessions(prev => prev.map(s => {
        if (s.id === currentSessionId) {
          return {
            ...s,
            messages: [...s.messages, aiMessage],
            lastUpdated: Date.now()
          };
        }
        return s;
    }));
      
    setIsGenerating(false);
    setGenerationTime(0);
    playUISound('receive');
  };

  const clearHistory = () => {
    playUISound('click');
    setSessions(prev => prev.map(s => {
        if(s.id === currentSessionId) {
            return { ...s, messages: [] };
        }
        return s;
    }));
  };

  const handlePlayAudio = (base64Data: string) => {
      playAudio(base64Data);
  };

  const handleModeChange = (mode: AppMode) => {
      playUISound('click');
      setCurrentMode(mode);
  }

  return (
    <div className="flex h-screen w-full bg-lynq-bg text-lynq-text overflow-hidden font-sans selection:bg-lynq-accent/30 selection:text-white">
      {/* Ambient Background */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <div className="absolute top-[-20%] left-[-10%] w-[1000px] h-[1000px] bg-lynq-accent/5 rounded-full blur-[160px] animate-pulse-slow" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[800px] h-[800px] bg-indigo-500/5 rounded-full blur-[160px] animate-float-delayed" />
          <div className="absolute top-[30%] left-[30%] w-[600px] h-[600px] bg-blue-500/5 rounded-full blur-[140px] animate-float" />
      </div>

      {isLiveCallActive && (
          <LiveCallOverlay onClose={() => setIsLiveCallActive(false)} />
      )}

      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/80 z-40 md:hidden backdrop-blur-md transition-opacity duration-300 animate-fade-in"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <div className={`
        fixed inset-y-0 left-0 z-50 w-72 bg-lynq-surface/90 backdrop-blur-2xl border-r border-lynq-border transform transition-transform duration-500 cubic-bezier(0.16, 1, 0.3, 1)
        md:relative md:translate-x-0
        ${isSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}
      `}>
        <Sidebar 
          sessions={sessions} 
          currentSessionId={currentSessionId}
          onSessionSelect={(id) => {
            playUISound('click');
            setCurrentSessionId(id);
            setIsSidebarOpen(false);
          }}
          onNewSession={createNewSession}
          onDeleteSession={deleteSession}
          onCloseMobile={() => setIsSidebarOpen(false)}
        />
      </div>

      <div className="flex-1 flex flex-col relative min-w-0 z-10 transition-all duration-300">
        
        <header className="h-16 flex items-center justify-between px-4 md:px-6 glass z-30 sticky top-0 transition-all duration-300">
            <div className="flex items-center gap-3">
                <button 
                    className="md:hidden p-2 text-lynq-text hover:text-lynq-accent transition-colors rounded-lg hover:bg-white/5"
                    onClick={() => setIsSidebarOpen(true)}
                >
                    <Menu size={20} />
                </button>
                <div className="flex items-center gap-2.5 group cursor-default">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-lynq-accent to-orange-400 flex items-center justify-center text-lynq-dark font-bold text-lg shadow-glow group-hover:scale-105 transition-transform duration-300">L</div>
                    <span className="font-semibold text-lg tracking-tight text-white/90">Lynq</span>
                </div>
            </div>
            
            {/* Mode Toggle */}
            <div className="flex bg-black/40 rounded-full p-1 border border-white/5 backdrop-blur-md shadow-inner overflow-x-auto scrollbar-hide max-w-[200px] md:max-w-none">
                <button 
                    onClick={() => handleModeChange(AppMode.FAST)}
                    className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-300 ease-out whitespace-nowrap ${currentMode === AppMode.FAST ? 'bg-white/10 text-lynq-accent shadow-glow ring-1 ring-white/5' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                >
                    Fast
                </button>
                <button 
                    onClick={() => handleModeChange(AppMode.SMART)}
                    className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-300 ease-out whitespace-nowrap ${currentMode === AppMode.SMART ? 'bg-white/10 text-lynq-accent shadow-glow ring-1 ring-white/5' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                >
                    Smart
                </button>
                <button 
                    onClick={() => handleModeChange(AppMode.VIDEO)}
                    className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-300 ease-out whitespace-nowrap ${currentMode === AppMode.VIDEO ? 'bg-white/10 text-lynq-accent shadow-glow ring-1 ring-white/5' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                >
                    Video
                </button>
                <button 
                    onClick={() => {
                        playUISound('on');
                        setIsLiveCallActive(true);
                    }}
                    className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-300 ease-out text-gray-400 hover:text-white hover:bg-white/5 flex items-center gap-1.5 group relative overflow-hidden whitespace-nowrap`}
                >
                    <span className="relative z-10 group-hover:text-white transition-colors">Voice</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]"></span>
                </button>
            </div>
        </header>

        <ChatArea 
            messages={currentSession.messages} 
            isGenerating={isGenerating}
            generationTime={generationTime}
            onSendMessage={handleSendMessage}
            onClear={clearHistory}
            onPlayAudio={handlePlayAudio}
            currentMode={currentMode}
        />

        <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 pb-6 bg-gradient-to-t from-lynq-bg via-lynq-bg/95 to-transparent pt-24 z-20 pointer-events-none">
            <div className="max-w-3xl mx-auto pointer-events-auto">
                <InputBar 
                    key={currentSessionId}
                    onSendMessage={handleSendMessage} 
                    isGenerating={isGenerating}
                    selectedStyle={selectedImageStyle}
                    onStyleSelect={setSelectedImageStyle}
                    currentMode={currentMode}
                    fastModeStyle={fastModeStyle}
                    onFastModeStyleChange={setFastModeStyle}
                />
                
                <div className="mt-3 text-center opacity-40 hover:opacity-100 transition-opacity duration-300">
                    <p className="text-[10px] text-gray-500 font-medium tracking-wide">
                        Lynq AI can make mistakes. Verify important info.
                    </p>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}
