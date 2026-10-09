// src/components/FamilyChat.tsx

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import Button from '@mui/material/Button';
import { useTheme } from '@mui/material/styles';
import { MAX_USER_MESSAGE_CHARS } from '../../supabase/functions/family-chat/limits.ts';
import { useFamilyChat } from '../hooks/useFamilyChat';

interface FamilyChatProps {
  // The person sheet is open: the chat sits behind it (the drawer is at 1200)
  // so it never covers the sheet's rows.
  behindSheet: boolean;
}

export const FamilyChat: React.FC<FamilyChatProps> = ({ behindSheet }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const { messages, isLoading, notice, isLimited, sendMessage, clearChat } = useFamilyChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { chat } = useTheme().palette;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen, isLoading]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const query = inputValue.trim().slice(0, MAX_USER_MESSAGE_CHARS);
    if (!query || isLoading || isLimited) return;

    setInputValue('');
    await sendMessage(query);
  };

  return (
    <div style={{ position: 'fixed', bottom: '20px', left: '20px', zIndex: behindSheet ? 1100 : 10000 }}>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            style={{
              width: '400px',
              height: '500px',
              backgroundColor: chat.surface,
              borderRadius: '12px',
              boxShadow: `0 8px 32px ${chat.shadow}`,
              border: `1px solid ${chat.border}`,
              display: 'flex',
              flexDirection: 'column',
              marginBottom: '15px',
              overflow: 'hidden'
            }}
          >
            {/* Header */}
            <div style={{
              padding: '12px 16px',
              backgroundColor: chat.bar,
              borderBottom: `1px solid ${chat.border}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }} >
              <div style={{ color: chat.ink, fontWeight: 'bold' }}>Family Chat Bot</div>
              <Button variant="text" size="small" onClick={clearChat} sx={{ color: chat.muted, minWidth: 'auto' }}>
                Clear
              </Button>
            </div>

            {/* Messages Area */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              {messages.length === 0 && (
                <div style={{ color: chat.hint, textAlign: 'center', marginTop: '20px', fontSize: '0.9rem' }}>
                  Ask me anything about your family tree!
                </div>
              )}
              {messages.map((msg, idx) => (
                <div 
                  key={idx}
                  style={{
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    padding: '8px 12px',
                    borderRadius: '12px',
                    fontSize: '0.9rem',
                    lineHeight: '1.4',
                    backgroundColor: msg.role === 'user' ? chat.userBubble : chat.bubble,
                    color: chat.ink,
                    borderBottomRightRadius: msg.role === 'user' ? '2px' : '12px',
                    borderBottomLeftRadius: msg.role === 'assistant' ? '2px' : '12px',
                  }}
                >
                  <ReactMarkdown 
                    components={{
                      p: ({children}) => <p style={{ margin: 0 }}>{children}</p>,
                      ul: ({children}) => <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>{children}</ul>,
                      ol: ({children}) => <ol style={{ margin: '8px 0', paddingLeft: '20px' }}>{children}</ol>,
                      li: ({children}) => <li style={{ marginBottom: '4px' }}>{children}</li>,
                      h3: ({children}) => <h3 style={{ fontSize: '1rem', margin: '12px 0 8px 0', color: chat.heading }}>{children}</h3>,
                      strong: ({children}) => <strong style={{ color: chat.ink, fontWeight: 'bold' }}>{children}</strong>
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>
              ))}
              {isLoading && (
                <div style={{ alignSelf: 'flex-start', padding: '8px 12px', backgroundColor: chat.bubble, borderRadius: '12px', color: chat.muted, fontSize: '0.9rem' }}>
                  AI is thinking...
                </div>
              )}
              {notice && (
                <div role="status" style={{ color: chat.notice, fontSize: '0.85rem', textAlign: 'center', padding: '5px' }}>
                  {notice.line}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <form 
              onSubmit={handleSend}
              style={{
                padding: '12px',
                backgroundColor: chat.bar,
                borderTop: `1px solid ${chat.border}`,
                display: 'flex',
                gap: '8px'
              }}
            >
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value.slice(0, MAX_USER_MESSAGE_CHARS))}
                placeholder="Who are my maternal cousins?"
                maxLength={MAX_USER_MESSAGE_CHARS}
                disabled={isLimited}
                style={{
                  flex: 1,
                  backgroundColor: chat.surface,
                  border: `1px solid ${chat.inputBorder}`,
                  borderRadius: '6px',
                  padding: '8px 12px',
                  color: chat.ink,
                  outline: 'none'
                }}
              />
              <Button type="submit" variant="contained" color="primary" disabled={isLoading || isLimited}>
                Send
              </Button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle Button */}
      <motion.div style={{ float: 'left' }} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
        <Button
          variant="contained"
          color="primary"
          onClick={() => setIsOpen(!isOpen)}
          sx={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            minWidth: 56,
            minHeight: 56,
            padding: 0,
            fontSize: '24px',
            boxShadow: `0 4px 16px ${chat.buttonShadow}`,
          }}
        >
          {isOpen ? '✕' : '🤖'}
        </Button>
      </motion.div>
    </div>
  );
};
