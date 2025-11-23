
import React, { useState, useRef, ChangeEvent, useEffect } from 'react';
import { Send, Paperclip, X, Palette, Zap, Image as ImageIcon, Video as VideoIcon, FileText } from 'lucide-react';
import { Attachment, AttachmentType, ImageStyle, AppMode, FastModeStyle } from '../types';
import { playUISound } from '../utils/sound';

interface InputBarProps {
  onSendMessage: (text: string, attachments: Attachment[]) => void;
  isGenerating: boolean;
  selectedStyle: ImageStyle;
  onStyleSelect: (style: ImageStyle) => void;
  currentMode: AppMode;
  fastModeStyle: FastModeStyle;
  onFastModeStyleChange: (style: FastModeStyle) => void;
}

export const InputBar: React.FC<InputBarProps> = ({ 
  onSendMessage, 
  isGenerating, 
  selectedStyle, 
  onStyleSelect,
  currentMode,
  fastModeStyle,
  onFastModeStyleChange
}) => {
  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const [showFastMenu, setShowFastMenu] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [inputText]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if ((!inputText.trim() && attachments.length === 0) || isGenerating) return;
    onSendMessage(inputText, attachments);
    setInputText('');
    setAttachments([]);
    if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
    }
  };

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      playUISound('click');
      const file = e.target.files[0];
      const isImage = file.type.startsWith('image/');
      
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target?.result as string;
        
        let type = AttachmentType.DOCUMENT;
        if (isImage) type = AttachmentType.IMAGE;
        
        const newAttachment: Attachment = {
          type,
          url: isImage ? URL.createObjectURL(file) : '', // Only create ObjectURL for images for preview
          base64: base64, 
          mimeType: file.type || 'text/plain', // Default to text for unknown
          name: file.name
        };
        setAttachments(prev => [...prev, newAttachment]);
      };
      
      if (isImage) {
          reader.readAsDataURL(file);
      } else {
          // For Gemini API, we send PDF/Text as base64 in inlineData too
          reader.readAsDataURL(file);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    playUISound('click');
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div 
      className={`
        w-full bg-lynq-surface/70 backdrop-blur-xl border rounded-2xl shadow-2xl transition-all duration-300 ease-out relative z-20
        ${isFocused 
            ? 'border-lynq-accent/30 shadow-glow ring-1 ring-lynq-accent/20 bg-lynq-surface/90' 
            : 'border-lynq-border hover:border-white/10'
        }
      `}
    >
      
      {/* Attachments Preview */}
      {attachments.length > 0 && (
        <div className="flex gap-3 p-4 border-b border-white/5 overflow-x-auto animate-fade-in scrollbar-hide">
          {attachments.map((att, i) => (
            <div key={i} className="relative group shrink-0 animate-scale-in" style={{ animationDelay: `${i * 50}ms` }}>
              {att.type === AttachmentType.IMAGE ? (
                <div className="w-20 h-20 rounded-xl overflow-hidden border border-white/10 shadow-md">
                   <img src={att.url} alt="preview" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-20 h-20 rounded-xl bg-white/5 border border-white/10 flex flex-col items-center justify-center p-2 text-center">
                   <FileText size={24} className="text-lynq-accent mb-1" />
                   <span className="text-[9px] text-gray-400 truncate w-full">{att.name}</span>
                </div>
              )}
              
              <button 
                onClick={() => removeAttachment(i)}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-md hover:scale-110"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 p-3">
        {/* Attachment Button */}
        <button 
          onClick={() => fileInputRef.current?.click()}
          onMouseEnter={() => playUISound('hover')}
          className="p-2.5 text-gray-400 hover:text-lynq-accent hover:bg-white/5 rounded-xl transition-all duration-200 shrink-0 group relative overflow-hidden"
          title="Attach Image or Document"
        >
          <Paperclip size={20} className="group-hover:rotate-12 transition-transform duration-300 relative z-10" />
          <div className="absolute inset-0 bg-lynq-accent/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          <input 
            type="file" 
            ref={fileInputRef}
            className="hidden" 
            accept="image/*,application/pdf,text/plain,text/csv,text/markdown"
            onChange={handleFileSelect}
          />
        </button>

        {/* Text Input */}
        <textarea
          ref={textareaRef}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={currentMode === AppMode.CREATIVE ? "Describe image..." : currentMode === AppMode.VIDEO ? "Describe the video you want..." : "Ask Lynq or attach a file..."}
          className="flex-1 bg-transparent border-none outline-none resize-none py-2.5 text-gray-200 placeholder-gray-500 max-h-[120px] overflow-y-auto leading-relaxed scrollbar-thin font-light text-base"
          rows={1}
        />

        {/* Style/Mode Controls */}
        <div className="flex items-center gap-1.5 shrink-0 mb-0.5">
            
            {/* Fast Mode Selector */}
            {currentMode === AppMode.FAST && (
                <div className="relative">
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            playUISound('click');
                            setShowFastMenu(!showFastMenu);
                            setShowStyleMenu(false);
                        }}
                        className={`p-2.5 rounded-xl transition-all duration-300 flex items-center gap-1 ${
                            fastModeStyle !== FastModeStyle.STANDARD 
                            ? 'text-lynq-accent bg-lynq-accent/10 shadow-glow' 
                            : 'text-gray-400 hover:text-white hover:bg-white/5'
                        }`}
                        title="Response Speed"
                    >
                        <Zap size={20} className={fastModeStyle !== FastModeStyle.STANDARD ? "fill-current" : ""} />
                    </button>
                    
                    {showFastMenu && (
                        <div className="absolute bottom-full mb-3 left-0 w-52 bg-[#121418] border border-white/10 rounded-2xl shadow-glass overflow-hidden z-50 animate-slide-up origin-bottom-left flex flex-col p-1.5 backdrop-blur-2xl">
                            <div className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-white/5 mb-1">
                                Response Speed
                            </div>
                            {Object.values(FastModeStyle).map((style) => (
                                <button
                                    key={style}
                                    onClick={() => {
                                        playUISound('click');
                                        onFastModeStyleChange(style);
                                        setShowFastMenu(false);
                                    }}
                                    className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all duration-200 flex items-center justify-between group ${
                                        fastModeStyle === style
                                        ? 'bg-lynq-accent text-lynq-dark font-medium shadow-md'
                                        : 'text-gray-400 hover:bg-white/5 hover:text-white'
                                    }`}
                                >
                                    <span>{style}</span>
                                    {fastModeStyle === style && <Zap size={14} className="fill-current" />}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Image Style Selector */}
            <div className="relative">
                <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        playUISound('click');
                        setShowStyleMenu(!showStyleMenu);
                        setShowFastMenu(false);
                    }}
                    className={`p-2.5 rounded-xl transition-all duration-300 ${
                        selectedStyle !== ImageStyle.DEFAULT 
                        ? 'text-lynq-accent bg-lynq-accent/10 shadow-glow' 
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                    title="Image Style"
                >
                    <Palette size={20} />
                </button>
                
                {showStyleMenu && (
                    <div className="absolute bottom-full mb-3 right-0 w-64 bg-[#121418] border border-white/10 rounded-2xl shadow-glass overflow-hidden z-50 animate-slide-up origin-bottom-right flex flex-col max-h-80 backdrop-blur-2xl">
                        <div className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-white/5 bg-[#121418]/95 sticky top-0 z-10 backdrop-blur-md">
                            Image Style
                        </div>
                        <div className="overflow-y-auto p-1.5 scrollbar-thin">
                            {Object.values(ImageStyle).map((style) => (
                                <button
                                    key={style}
                                    onClick={() => {
                                        playUISound('click');
                                        onStyleSelect(style);
                                        setShowStyleMenu(false);
                                    }}
                                    className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all duration-200 flex items-center justify-between ${
                                        selectedStyle === style
                                        ? 'bg-lynq-accent text-lynq-dark font-medium shadow-md'
                                        : 'text-gray-400 hover:bg-white/5 hover:text-white'
                                    }`}
                                >
                                    <span>{style}</span>
                                    {selectedStyle === style && <ImageIcon size={14} />}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Send Button */}
            <button 
                onClick={handleSend}
                disabled={(!inputText.trim() && attachments.length === 0) || isGenerating}
                onMouseEnter={() => !((!inputText.trim() && attachments.length === 0) || isGenerating) && playUISound('hover')}
                className={`p-2.5 rounded-xl transition-all duration-300 flex items-center justify-center transform ${
                    (!inputText.trim() && attachments.length === 0) || isGenerating
                    ? 'bg-white/5 text-gray-600 cursor-not-allowed'
                    : 'bg-lynq-accent text-lynq-dark hover:bg-lynq-accentHover shadow-glow hover:scale-105 active:scale-95'
                }`}
            >
                <Send size={20} className={isGenerating ? "animate-pulse" : ""} />
            </button>
        </div>
      </div>
      
      {/* Click outside closer overlay */}
      {(showStyleMenu || showFastMenu) && (
          <div 
            className="fixed inset-0 z-0" 
            onClick={() => {
                setShowStyleMenu(false);
                setShowFastMenu(false);
            }} 
          />
      )}

    </div>
  );
};
