// src/components/FamilyChat.tsx

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import Button from '@mui/material/Button';
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
              backgroundColor: '#1a1a1a',
              borderRadius: '12px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              border: '1px solid #333',
              display: 'flex',
              flexDirection: 'column',
              marginBottom: '15px',
              overflow: 'hidden'
            }}
          >
            {/* Header */}
            <div style={{
              padding: '12px 16px',
              backgroundColor: '#2a2a2a',
              borderBottom: '1px solid #333',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }} >
              <div style={{ color: '#fff', fontWeight: 'bold' }}>Family Chat Bot</div>
              <Button variant="text" size="small" onClick={clearChat} sx={{ color: '#888', minWidth: 'auto' }}>
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
                <div style={{ color: '#666', textAlign: 'center', marginTop: '20px', fontSize: '0.9rem' }}>
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
                    backgroundColor: msg.role === 'user' ? '#3b82f6' : '#333',
                    color: '#fff',
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
                      h3: ({children}) => <h3 style={{ fontSize: '1rem', margin: '12px 0 8px 0', color: '#3b82f6' }}>{children}</h3>,
                      strong: ({children}) => <strong style={{ color: '#fff', fontWeight: 'bold' }}>{children}</strong>
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>
              ))}
              {isLoading && (
                <div style={{ alignSelf: 'flex-start', padding: '8px 12px', backgroundColor: '#333', borderRadius: '12px', color: '#888', fontSize: '0.9rem' }}>
                  AI is thinking...
                </div>
              )}
              {notice && (
                <div role="status" style={{ color: '#fbbf24', fontSize: '0.85rem', textAlign: 'center', padding: '5px' }}>
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
                backgroundColor: '#2a2a2a',
                borderTop: '1px solid #333',
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
                  backgroundColor: '#1a1a1a',
                  border: '1px solid #444',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  color: '#fff',
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
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          }}
        >
          {isOpen ? '✕' : '🤖'}
        </Button>
      </motion.div>
    </div>
  );
};
