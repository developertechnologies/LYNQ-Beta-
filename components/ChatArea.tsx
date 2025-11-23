
import React, { useEffect, useRef } from 'react';
import { Message, Attachment, AppMode } from '../types';
import { MessageBubble } from './MessageBubble';
import { Sparkles, Clock, Zap, Globe, Video } from 'lucide-react';
import { playUISound } from '../utils/sound';

interface ChatAreaProps {
  messages: Message[];
  isGenerating: boolean;
  generationTime?: number;
  onSendMessage: (text: string, attachments: Attachment[]) => void;
  onClear: () => void;
  onPlayAudio: (base64Data: string) => void;
  currentMode: AppMode;
}

export const ChatArea: React.FC<ChatAreaProps> = ({ 
  messages, 
  isGenerating, 
  generationTime = 0,
  onSendMessage,
  onClear,
  onPlayAudio,
  currentMode
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isGenerating]);

  return (
    <div className="flex-1 flex flex-col h-full relative overflow-hidden">
      
      {/* Messages List - Enhanced padding and scroll behavior */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 md:space-y-8 pb-40 scroll-smooth custom-scrollbar"
      >
        {messages.length === 0 ? (
          <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4 animate-fade-in">
            <div className="w-24 h-24 rounded-[2rem] bg-gradient-to-br from-lynq-accent to-orange-500 flex items-center justify-center text-lynq-dark mb-8 shadow-glow-lg animate-float">
               <Sparkles size={48} strokeWidth={1.5} />
            </div>
            <h2 className="text-4xl font-bold text-white mb-4 tracking-tight drop-shadow-lg">Lynq AI</h2>
            <p className="text-lynq-textMuted max-w-lg text-center leading-relaxed mb-12 text-lg">
              Hii buddy, I am LYNQ created by <span className="text-white font-medium border-b border-lynq-accent/30 hover:border-lynq-accent transition-colors cursor-default">LYNQ Technologies</span>. <br/>
              Ready to create something amazing?
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
               {[
                 { label: "Who is lynq ?", icon: "🤖" },
                 { label: "Need startup ideas 💡", icon: "🚀" },
                 { label: "Generate an image", icon: "🎨" },
                 { label: "Something surprising", icon: "✨" }
               ].map((item, i) => (
                 <button 
                   key={i}
                   onClick={() => {
                       playUISound('send');
                       onSendMessage(item.label, []);
                   }}
                   onMouseEnter={() => playUISound('hover')}
                   className="group relative px-6 py-4 bg-lynq-surface/40 hover:bg-lynq-surface/80 border border-white/5 hover:border-lynq-accent/20 rounded-2xl text-sm text-lynq-textMuted hover:text-white transition-all duration-300 text-left hover:-translate-y-1 shadow-sm hover:shadow-glow overflow-hidden animate-slide-up"
                   style={{ animationDelay: `${i * 100}ms` }}
                 >
                   <div className="flex items-center justify-between relative z-10">
                      <span className="font-medium">{item.label}</span>
                      <span className="opacity-50 grayscale group-hover:grayscale-0 transition-all text-lg group-hover:scale-110 duration-300">{item.icon}</span>
                   </div>
                   <div className="absolute inset-0 bg-gradient-to-r from-lynq-accent/0 via-lynq-accent/5 to-lynq-accent/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-in-out"></div>
                 </button>
               ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} onPlayAudio={onPlayAudio} />
          ))
        )}
        
        {isGenerating && (
          <div className="flex items-center gap-4 max-w-3xl mx-auto w-full animate-fade-in pl-14 md:pl-16">
             <div className="flex items-center gap-3 bg-lynq-surface/60 border border-lynq-border px-5 py-2.5 rounded-full backdrop-blur-md shadow-glow relative overflow-hidden group">
               
               {/* Mode-Specific Background Effects */}
               {currentMode === AppMode.SMART && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-500/10 to-transparent animate-shimmer" style={{ backgroundSize: '200% 100%' }}></div>
               )}
               {currentMode === AppMode.FAST && (
                  <div className="absolute inset-0 bg-yellow-400/5 animate-pulse"></div>
               )}

               {/* Icon Animation */}
               <div className="relative z-10">
                  {currentMode === AppMode.FAST ? (
                      <Zap size={18} className="text-yellow-400 animate-[pulse_0.2s_ease-in-out_infinite]" fill="currentColor" />
                  ) : currentMode === AppMode.SMART ? (
                      <Globe size={18} className="text-cyan-400 animate-[spin_3s_linear_infinite]" />
                  ) : currentMode === AppMode.VIDEO ? (
                      <Video size={18} className="text-purple-400 animate-pulse" />
                  ) : (
                      <div className="flex items-center gap-1.5 h-4">
                        <div className="w-2 h-2 rounded-full bg-lynq-accent animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 rounded-full bg-lynq-accent animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 rounded-full bg-lynq-accent animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                  )}
               </div>

               <div className="w-px h-4 bg-white/10 mx-2 relative z-10"></div>
               
               {/* Text & Timer */}
               <div className="text-[11px] font-mono text-lynq-textMuted flex items-center gap-2 relative z-10">
                  <span className={`font-bold tracking-wider ${
                      currentMode === AppMode.FAST ? 'text-yellow-400/90' : 
                      currentMode === AppMode.SMART ? 'text-cyan-400/90' : ''
                  }`}>
                      {currentMode === AppMode.FAST ? "TURBO PROCESSING" :
                       currentMode === AppMode.SMART ? "BROWSING WEB" :
                       currentMode === AppMode.VIDEO ? "RENDERING VIDEO" : 
                       "THINKING"}
                  </span>
                  
                  {(currentMode !== AppMode.CREATIVE && currentMode !== AppMode.VOICE) && (
                      <>
                        <span className="opacity-30">|</span>
                        <div className="flex items-center gap-1">
                            <Clock size={10} className="opacity-70" />
                            <span>{(generationTime / 1000).toFixed(1)}s</span>
                        </div>
                      </>
                  )}
               </div>
             </div>
          </div>
        )}
        
        <div ref={scrollRef} className="h-4" />
      </div>
    </div>
  );
};
