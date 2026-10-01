// src/hooks/useFamilyChat.ts

import { useState, useCallback, useEffect, useRef } from 'react';
import type { ChatTurn } from '../../supabase/functions/family-chat/request.ts';
import { askFamilyChat } from '../lib/familyChat';
import { invokeFamilyChat } from '../lib/familyChatClient';
import { useWorkingRecord } from '../contexts/WorkingRecordContext';

const MAX_DISPLAYED_MESSAGES = 50;

/** One bubble in the chat. */
export interface ChatBubble {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * A line in place of an answer. A limit line (daily limit, credit gone)
 * disables the input while it shows; a daily limit lifts at `resetsAt`.
 */
export interface ChatNotice {
  line: string;
  isLimit: boolean;
  resetsAt?: string;
}

/**
 * The family chat's state. The question goes to the family-chat function with
 * the earlier turns; tool calls run on the Working Record, read by reference
 * when the question is sent (ADR 0009), so the chat never fetches the tree.
 */
export function useFamilyChat() {
  const [messages, setMessages] = useState<ChatBubble[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState<ChatNotice | null>(null);
  const { working } = useWorkingRecord();

  const workingRef = useRef(working);
  workingRef.current = working;
  /** The turns sent so far, tool rounds included; the model needs them for follow-ups. */
  const historyRef = useRef<ChatTurn[]>([]);
  const busyRef = useRef(false);

  // A daily limit lifts at the next midnight in the UAE.
  useEffect(() => {
    if (!notice?.resetsAt) return;
    const wait = Date.parse(notice.resetsAt) - Date.now();
    if (!Number.isFinite(wait)) return;
    const timer = setTimeout(() => setNotice(null), Math.max(0, wait));
    return () => clearTimeout(timer);
  }, [notice]);

  const isLimited = notice?.isLimit ?? false;

  const sendMessage = useCallback(
    async (question: string) => {
      if (!question.trim() || busyRef.current || isLimited) return;
      busyRef.current = true;
      setIsLoading(true);
      setNotice(null);
      setMessages((prev) => [...prev, { role: 'user', content: question }]);

      try {
        const outcome = await askFamilyChat({
          question,
          history: historyRef.current,
          record: workingRef.current ?? { nodes: [], links: [] },
          send: invokeFamilyChat,
          messageId: crypto.randomUUID(),
        });
        if (outcome.ok) {
          historyRef.current = outcome.turns;
          setMessages((prev) => [...prev, { role: 'assistant', content: outcome.answer }]);
        } else {
          setNotice({ line: outcome.line, isLimit: outcome.cause !== 'failed', resetsAt: outcome.resetsAt });
        }
      } finally {
        busyRef.current = false;
        setIsLoading(false);
      }
    },
    [isLimited],
  );

  /** Clears the conversation. A limit line stays: the limit still holds. */
  const clearChat = useCallback(() => {
    setMessages([]);
    historyRef.current = [];
    setNotice((current) => (current?.isLimit ? current : null));
  }, []);

  return {
    messages: messages.slice(-MAX_DISPLAYED_MESSAGES),
    isLoading,
    notice,
    isLimited,
    sendMessage,
    clearChat,
  };
}
