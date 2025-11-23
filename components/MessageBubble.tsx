
import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Message, MessageRole, AttachmentType } from '../types';
import { User, Sparkles, Copy, ExternalLink, Play, Check, FileText } from 'lucide-react';
import { playUISound } from '../utils/sound';

interface MessageBubbleProps {
  message: Message;
  onPlayAudio?: (base64Data: string) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, onPlayAudio }) => {
  const isUser = message.role === MessageRole.USER;
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    playUISound('click');
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePlay = () => {
      playUISound('click');
      if (message.audioData && onPlayAudio) {
          onPlayAudio(message.audioData);
      }
  }

  return (
    <div className={`flex w-full mb-6 animate-slide-up ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-[90%] md:max-w-[80%] gap-3 md:gap-4 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        
        {/* Avatar */}
        <div className="shrink-0 mt-1">
          {isUser ? (
            <div className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-gradient-to-tr from-gray-700 to-gray-600 flex items-center justify-center text-white shadow-lg ring-1 ring-white/10">
              <User size={16} />
            </div>
          ) : (
            <div className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-gradient-to-br from-lynq-accent to-orange-500 flex items-center justify-center text-lynq-dark shadow-glow ring-1 ring-white/10">
              <Sparkles size={16} className="fill-lynq-dark/20" />
            </div>
          )}
        </div>

        {/* Content Bubble */}
        <div className={`flex flex-col gap-2 ${isUser ? 'items-end' : 'items-start'} min-w-0 max-w-full`}>
          
          {/* Attachments (Images, Documents, Videos) */}
          {message.attachments && message.attachments.length > 0 && (
            <div className={`flex flex-wrap gap-2 mb-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
              {message.attachments.map((att, idx) => {
                  if (att.type === AttachmentType.IMAGE) {
                      return (
                        <div key={idx} className="relative rounded-xl overflow-hidden border border-white/10 shadow-lg max-w-[200px] group transition-transform hover:scale-105">
                            <img src={att.url} alt="attachment" className="w-full h-auto object-cover" />
                        </div>
                      );
                  }
                  if (att.type === AttachmentType.VIDEO) {
                      return (
                        <div key={idx} className="relative rounded-xl overflow-hidden border border-white/10 shadow-lg w-full max-w-[300px]">
                            <video src={att.url} controls className="w-full h-auto" />
                        </div>
                      );
                  }
                  if (att.type === AttachmentType.DOCUMENT) {
                       return (
                           <div key={idx} className="flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-xl max-w-[220px]">
                               <div className="w-10 h-10 rounded-lg bg-lynq-surface flex items-center justify-center text-lynq-accent">
                                   <FileText size={20} />
                               </div>
                               <div className="flex-1 min-w-0">
                                   <p className="text-xs font-medium text-white truncate">{att.name || 'Document'}</p>
                                   <p className="text-[10px] text-gray-500">{att.mimeType || 'File'}</p>
                               </div>
                           </div>
                       );
                  }
                  return null;
              })}
            </div>
          )}

          {/* Text Content */}
          <div 
            className={`
              relative px-4 py-3 md:px-6 md:py-4 rounded-2xl shadow-sm text-[15px] leading-relaxed overflow-hidden group
              ${isUser 
                ? 'bg-white/10 text-white rounded-tr-sm backdrop-blur-md border border-white/5' 
                : 'bg-lynq-surface/90 text-gray-100 rounded-tl-sm border border-lynq-border shadow-glass backdrop-blur-md'
              }
            `}
          >
            {/* Audio Player Button (Model only) */}
            {!isUser && message.audioData && (
                 <button 
                    onClick={handlePlay}
                    className="flex items-center gap-2 bg-lynq-accent/10 hover:bg-lynq-accent/20 text-lynq-accent px-3 py-1.5 rounded-lg mb-3 text-xs font-medium transition-colors w-fit border border-lynq-accent/20"
                 >
                    <Play size={12} className="fill-current" />
                    <span>Play Voice Response</span>
                 </button>
            )}

            <div className="markdown-content break-words font-light">
              <ReactMarkdown 
                 components={{
                    a: ({node, ...props}) => <a {...props} className="text-lynq-accent hover:underline decoration-lynq-accent/50 underline-offset-2" target="_blank" rel="noopener noreferrer" />,
                    code: ({node, className, children, ...props}) => {
                        const match = /language-(\w+)/.exec(className || '')
                        const isInline = !match && !String(children).includes('\n');
                        return !isInline ? (
                            <div className="relative my-4 rounded-lg overflow-hidden bg-black/40 border border-white/10 shadow-inner">
                                <div className="flex items-center justify-between px-3 py-1.5 bg-white/5 border-b border-white/5">
                                    <span className="text-xs text-gray-500 font-mono tracking-wide uppercase">{match?.[1] || 'code'}</span>
                                </div>
                                <div className="p-3 overflow-x-auto custom-scrollbar">
                                    <code className={`!bg-transparent text-sm font-mono ${className}`} {...props}>
                                        {children}
                                    </code>
                                </div>
                            </div>
                        ) : (
                            <code className="bg-white/10 px-1.5 py-0.5 rounded text-sm font-mono text-lynq-accent/90 border border-white/5" {...props}>
                                {children}
                            </code>
                        )
                    },
                    ul: ({node, ...props}) => <ul className="list-disc pl-5 my-2 space-y-1 marker:text-lynq-accent" {...props} />,
                    ol: ({node, ...props}) => <ol className="list-decimal pl-5 my-2 space-y-1 marker:text-lynq-accent" {...props} />,
                    p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                    h1: ({node, ...props}) => <h1 className="text-lg font-semibold mt-4 mb-2 text-white" {...props} />,
                    h2: ({node, ...props}) => <h2 className="text-base font-semibold mt-3 mb-2 text-white/90" {...props} />,
                    blockquote: ({node, ...props}) => <blockquote className="border-l-2 border-lynq-accent/50 pl-4 py-1 my-2 bg-lynq-accent/5 italic text-gray-400" {...props} />,
                 }}
              >
                {message.content}
              </ReactMarkdown>
            </div>

            {/* Actions Footer (Copy, etc) */}
            {!isUser && (
                <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <button 
                        onClick={handleCopy}
                        className="text-gray-500 hover:text-white transition-colors flex items-center gap-1.5 text-xs hover:bg-white/5 px-2 py-1 rounded"
                    >
                        {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                        <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                </div>
            )}
          </div>
          
          {/* Grounding / Sources */}
          {message.groundingUrls && message.groundingUrls.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-1 ml-1">
                  {message.groundingUrls.map((url, idx) => (
                      <a 
                        key={idx}
                        href={url.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-lynq-surfaceHover/50 border border-white/5 rounded-lg text-[10px] text-lynq-textMuted hover:text-lynq-accent hover:border-lynq-accent/30 hover:shadow-glow transition-all max-w-[200px] truncate"
                      >
                          <ExternalLink size={10} />
                          <span className="truncate">{url.title}</span>
                      </a>
                  ))}
              </div>
          )}

          {/* Timestamp & Status */}
          <div className={`flex items-center gap-2 mt-1 px-1 text-[10px] text-gray-500/80 ${isUser ? 'justify-end' : 'justify-start'}`}>
              <span>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              {!isUser && message.executionTime && (
                  <>
                    <span>•</span>
                    <span className="text-lynq-accent/80 font-mono">{(message.executionTime / 1000).toFixed(2)}s</span>
                  </>
              )}
          </div>

        </div>
      </div>
    </div>
  );
};
