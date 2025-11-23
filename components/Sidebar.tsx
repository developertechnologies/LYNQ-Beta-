import React from 'react';
import { ChatSession } from '../types';
import { Plus, MessageSquare, Trash2, Github, Settings, X } from 'lucide-react';

interface SidebarProps {
  sessions: ChatSession[];
  currentSessionId: string;
  onSessionSelect: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession?: (e: React.MouseEvent, id: string) => void;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  sessions, 
  currentSessionId, 
  onSessionSelect, 
  onNewSession,
  onDeleteSession,
  onCloseMobile
}) => {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 md:p-5 flex items-center justify-between border-b border-lynq-border">
          <button 
            onClick={onNewSession}
            className="flex-1 flex items-center justify-center gap-2 bg-lynq-accent/10 hover:bg-lynq-accent/20 text-lynq-accent border border-lynq-accent/20 rounded-xl px-4 py-3 transition-all duration-300 group"
          >
              <Plus size={18} className="group-hover:scale-110 transition-transform" />
              <span className="text-sm font-semibold">New Chat</span>
          </button>
          
          <button 
             onClick={onCloseMobile}
             className="md:hidden ml-2 p-2 text-gray-500 hover:text-white"
          >
             <X size={20} />
          </button>
      </div>

      {/* Session List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
          <div className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
              Recent Activity
          </div>
          
          {sessions.map((session, index) => (
              <div 
                key={session.id}
                onClick={() => onSessionSelect(session.id)}
                className={`
                    group relative flex items-center gap-3 px-3 py-3 rounded-lg cursor-pointer transition-all duration-200
                    ${session.id === currentSessionId 
                        ? 'bg-lynq-surfaceHover text-white shadow-sm ring-1 ring-white/5' 
                        : 'text-lynq-textMuted hover:bg-white/5 hover:text-lynq-text'
                    }
                    animate-slide-up
                `}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                  <MessageSquare size={16} className={session.id === currentSessionId ? 'text-lynq-accent' : 'text-gray-600'} />
                  
                  <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{session.title}</p>
                      <p className="text-[10px] opacity-50 truncate">
                          {new Date(session.lastUpdated).toLocaleDateString()}
                      </p>
                  </div>

                  {/* Delete Button (Visible on hover or active) */}
                  {onDeleteSession && (
                      <button 
                        onClick={(e) => onDeleteSession(e, session.id)}
                        className={`
                            p-1.5 rounded-md text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100
                            ${session.id === currentSessionId ? 'opacity-100' : ''}
                        `}
                      >
                          <Trash2 size={14} />
                      </button>
                  )}
              </div>
          ))}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-lynq-border mt-auto bg-black/20">
          <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer group">
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-gray-700 to-gray-600 flex items-center justify-center text-xs font-bold text-white ring-2 ring-transparent group-hover:ring-lynq-accent/50 transition-all">
                  US
              </div>
              <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-200">User</p>
                  <p className="text-[10px] text-gray-500">Free Plan</p>
              </div>
              <Settings size={16} className="text-gray-500 group-hover:text-lynq-accent transition-colors" />
          </div>
      </div>
    </div>
  );
};