// src/hooks/useFamilyChat.ts

import { useState, useCallback, useMemo } from 'react';
import { Message, callLLM } from '../utils/llmClient';
import { formatFamilyData } from '../utils/familyContext';
import { formatNodeDisplayName } from '../utils/nodeDisplayName';
import { useWorkingRecord } from '../contexts/WorkingRecordContext';
import { useAuth } from '../contexts/AuthContext';

const MAX_DISPLAYED_MESSAGES = 50;

export function useFamilyChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { working: graphData } = useWorkingRecord();
  const { userProfile } = useAuth();

  const currentUserName = useMemo(() => {
    if (!userProfile?.node_id || !graphData?.nodes) return null;
    const node = graphData.nodes.find(n => n.id === userProfile.node_id);
    return node ? formatNodeDisplayName(node) : null;
  }, [userProfile, graphData]);

  const sendMessage = useCallback(async (userQuery: string) => {
    if (!userQuery.trim()) return;

    setIsLoading(true);
    setError(null);

    // Add user message to UI
    const userMessage: Message = { role: 'user', content: userQuery };
    setMessages(prev => [...prev, userMessage]);

    try {
      // Prepare context from family data
      const familyContext = graphData 
        ? formatFamilyData(graphData.nodes, graphData.links)
        : 'Family data is currently unavailable.';

      const userIdentityContext = currentUserName 
        ? `The user currently signed in and speaking to you is **${currentUserName}**. When they use first-person pronouns like "I", "me", "my", or "mine", they are referring to **${currentUserName}**.`
        : `The user's specific identity in the family tree is currently unknown, but they are likely a family member.`;

      const systemPrompt: Message = {
        role: 'system',
        content: `You are an expert Family Tree Analyst. Use the provided family data to answer questions with 100% accuracy.

USER IDENTITY:
${userIdentityContext}

REASONING PROTOCOL:
1. DATA SCOPE: Use the "FAMILY PROFILES" provided. Each profile lists parents, siblings, spouses, and children.
2. COUSINS: 
   - A person's cousins are the children of their parents' siblings.
   - Trace: Subject -> Parents -> Parents' Siblings -> Their Children.
3. MATERNAL VS PATERNAL: 
   - "Maternal" means tracing through the Mother (usually female).
   - "Paternal" means tracing through the Father (usually male).
   - If gender is not explicit, use names to infer (e.g., Baha = Mother, Basel = Father).
4. ROBUSTNESS: 
   - Always check BOTH parents for siblings to find all cousins.
   - Blood relationships cross "Family Clusters".
5. COUNTING: List names first, categorized by side (Maternal/Paternal), then give the total.
6. OUTPUT STYLE: 
   - Use **Markdown** for better readability.
   - **Bold** names of family members.
   - Use bulleted lists for groups of relatives.
   - Use headers (e.g., ### Maternal Side) to separate different lineages if applicable.
   - BE EXTREMELY CONCISE. Answering the question directly is the priority. Do not include introductory filler or closing pleasantries unless necessary for clarity.
   - If asked to count, list the names first, then provide the total.
   - IMPORTANT: Never show your reasoning process. Only output the final answer. No step-by-step workthrough.
7. NAME AMBIGUITY: Distinguish between people with the same name using their family cluster or specific relatives.
8. INTERPRETATION: "Fahd" refers to "Fahd Badran".
9. CLARIFICATION: In case of ambiguity, ask the user to provide more information (e.g. "which Nada are you referring to: Okasha or Badran")

Family Data:
${familyContext}`
      };

      const recentMessages = messages.slice(-20);
      const llmResponse = await callLLM([systemPrompt, ...recentMessages, userMessage]);

      const assistantMessage: Message = { role: 'assistant', content: llmResponse };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      console.error('Chat error:', err);
      setError(err instanceof Error ? err.message : 'Failed to get a response from the AI.');
    } finally {
      setIsLoading(false);
    }
  }, [graphData, messages, currentUserName]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  const displayedMessages = messages.slice(-MAX_DISPLAYED_MESSAGES);

  return {
    messages: displayedMessages,
    isLoading,
    error,
    sendMessage,
    clearChat
  };
}
