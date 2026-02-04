import { useState, useEffect, useLayoutEffect, useRef, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import Stage1 from './Stage1';
import Stage2 from './Stage2';
import Stage3 from './Stage3';
import './ChatInterface.css';
import { normalizeMathDelimiters } from '../utils/markdown';

const MessagesView = memo(function MessagesView({
  conversation,
  onToggleStage,
  expandedUserMessages,
  setExpandedUserMessages,
  isLoading,
  onResendMessage,
}) {
  if (!conversation) {
    return (
      <div className="empty-state">
        <h2>Welcome to LLM Council</h2>
        <p>Create a new conversation to get started</p>
      </div>
    );
  }

  const isFailureText = (text) => {
    if (typeof text !== 'string') return false;
    return text.toLowerCase().startsWith('error:') ||
      text.includes('Unable to generate final synthesis');
  };

  const formatIndexList = (indices) => {
    if (!Array.isArray(indices) || indices.length === 0) return 'none';
    const sorted = [...indices].sort((a, b) => a - b);
    const isContiguous = sorted.every((v, i) => i === 0 || v === sorted[i - 1] + 1);
    if (isContiguous) {
      return sorted.length === 1 ? `${sorted[0]}` : `${sorted[0]}-${sorted[sorted.length - 1]}`;
    }
    if (sorted.length <= 8) return sorted.join(', ');
    return `${sorted.slice(0, 3).join(', ')} ... ${sorted.slice(-2).join(', ')}`;
  };

  const lastAssistantIndex = conversation.messages
    .map((msg, idx) => (msg.role === 'assistant' ? idx : -1))
    .reduce((acc, idx) => (idx > acc ? idx : acc), -1);
  const lastUserIndex = conversation.messages
    .map((msg, idx) => (msg.role === 'user' ? idx : -1))
    .reduce((acc, idx) => (idx > acc ? idx : acc), -1);

  return conversation.messages.length === 0 ? (
    <div className="empty-state">
      <h2>Start a conversation</h2>
      <p>Ask a question to consult the LLM Council</p>
    </div>
  ) : (
    <>
      {conversation.messages.length > 6 && (
        <div className="context-indicator">
          💭 Using conversation context ({conversation.messages.length} messages)
        </div>
      )}
      {(() => {
        // Group messages into "turn cards" so each user prompt + all assistant stages
        // are visually separated. Indices remain the original message indices.
        const turns = [];
        const { messages } = conversation;

        let i = 0;
        while (i < messages.length) {
          const msg = messages[i];

          if (msg.role === 'user') {
            const user = { msg, index: i };
            i += 1;

            const assistants = [];
            while (i < messages.length && messages[i].role !== 'user') {
              assistants.push({ msg: messages[i], index: i });
              i += 1;
            }

            turns.push({ user, assistants });
            continue;
          }

          // Orphan assistant (should be rare, but keep UI resilient).
          turns.push({ user: null, assistants: [{ msg, index: i }] });
          i += 1;
        }

        return turns.map((turn, turnIdx) => (
          <div key={turn.user?.index ?? `orphan-${turnIdx}`} className="turn-card">
            {turn.user && (
              <div className="user-message">
                <div className="message-label">
                  You {turn.user.msg.failed && <span className="message-failed">[FAILED]</span>}
                </div>
                <div className="message-content">
                  <div
                    className={`markdown-content ${
                      expandedUserMessages[turn.user.index] ? '' : 'message-collapsed'
                    }`}
                  >
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeRaw, rehypeKatex]}
                    >
                      {normalizeMathDelimiters(turn.user.msg.content)}
                    </ReactMarkdown>
                  </div>
                  {turn.user.msg.content &&
                    (turn.user.msg.content.split('\n').length > 5 || turn.user.msg.content.length > 400) && (
                    <button
                      type="button"
                      className="message-toggle"
                      onClick={() =>
                        setExpandedUserMessages((prev) => ({
                          ...prev,
                          [turn.user.index]: !prev[turn.user.index],
                        }))
                      }
                    >
                      {expandedUserMessages[turn.user.index] ? 'Show less' : 'Show more'}
                    </button>
                  )}
                  {turn.user.index === lastUserIndex && (
                    <button
                      type="button"
                      className="message-resend"
                      onClick={() => onResendMessage?.(turn.user.index)}
                      disabled={isLoading}
                    >
                      Resend
                    </button>
                  )}
                </div>
              </div>
            )}

            {turn.assistants.map(({ msg, index }) => (
              <div key={index} className="assistant-message">
                <div className="message-label">LLM Council</div>
                {msg.context_debug && (
                  <div className="context-debug">
                    Context: {msg.context_debug.total_tokens_after ?? '?'} / {msg.context_debug.budget ?? '?'} tokens |{' '}
                    summarized {msg.context_debug.summarized_message_count ?? 0} msg(s){' '}
                    ({formatIndexList(msg.context_debug.summarized_indices)}) | dropped{' '}
                    {msg.context_debug.dropped_message_count ?? 0} msg(s) ({formatIndexList(msg.context_debug.dropped_indices)})
                  </div>
                )}
                {(() => {
                  const computedStage = msg.stage3
                    ? 'stage3'
                    : msg.stage2
                      ? 'stage2'
                      : msg.stage1
                        ? 'stage1'
                        : null;
                  const activeStage = msg.expandedStage === undefined
                    ? (index === lastAssistantIndex ? computedStage : null)
                    : msg.expandedStage;

                  const isStage1Collapsed = activeStage !== 'stage1';
                  const isStage2Collapsed = activeStage !== 'stage2';
                  const isStage3Collapsed = activeStage !== 'stage3';

                  const stage1Failed = !!msg.failedStages?.stage1;
                  const stage2Failed = !!msg.failedStages?.stage2;
                  const stage3Failed =
                    !!msg.failedStages?.stage3 || isFailureText(msg.stage3?.response);

                  return (
                    <>
                      {/* Stage 1 */}
                      {msg.loading?.stage1 && (
                        <div className="stage-loading">
                          <div className="spinner"></div>
                          <span>Running Stage 1: Collecting individual responses...</span>
                        </div>
                      )}
                      {(msg.stage1 || stage1Failed) && (
                        <Stage1
                          responses={msg.stage1}
                          collapsed={!!isStage1Collapsed}
                          onToggle={() => onToggleStage?.(index, 'stage1')}
                          failed={stage1Failed}
                        />
                      )}

                      {/* Stage 2 */}
                      {msg.loading?.stage2 && (
                        <div className="stage-loading">
                          <div className="spinner"></div>
                          <span>Running Stage 2: Peer rankings...</span>
                        </div>
                      )}
                      {(msg.stage2 || stage2Failed) && (
                        <Stage2
                          rankings={msg.stage2}
                          labelToModel={msg.metadata?.label_to_model}
                          aggregateRankings={msg.metadata?.aggregate_rankings}
                          collapsed={!!isStage2Collapsed}
                          onToggle={() => onToggleStage?.(index, 'stage2')}
                          failed={stage2Failed}
                        />
                      )}

                      {/* Stage 3 */}
                      {msg.loading?.stage3 && (
                        <div className="stage-loading">
                          <div className="spinner"></div>
                          <span>Running Stage 3: Final synthesis...</span>
                        </div>
                      )}
                      {(msg.stage3 || stage3Failed) && (
                        <Stage3
                          finalResponse={msg.stage3}
                          collapsed={!!isStage3Collapsed}
                          onToggle={() => onToggleStage?.(index, 'stage3')}
                          failed={stage3Failed}
                        />
                      )}
                    </>
                  );
                })()}
              </div>
            ))}
          </div>
        ));
      })()}

      {isLoading && (
        <div className="loading-indicator">
          <div className="spinner"></div>
          <span>Consulting the council...</span>
        </div>
      )}
    </>
  );
});

export default function ChatInterface({
  conversation,
  onSendMessage,
  isLoading,
  onToggleStage,
  onResendMessage,
}) {
  const [input, setInput] = useState('');
  const [expandedUserMessages, setExpandedUserMessages] = useState({});
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const lastConversationIdRef = useRef(null);
  const lastMessageCountRef = useRef(0);

  const scrollToBottom = (behavior = 'auto') => {
    const el = messagesContainerRef.current;
    if (!el) return;
    // Avoid visible "scrolling down" animation when opening a conversation.
    el.scrollTo({ top: el.scrollHeight, behavior });
  };

  const updateNearBottom = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const threshold = 80;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distanceFromBottom < threshold;
  };

  // Keep the view pinned to the latest messages. useLayoutEffect prevents the
  // "scroll after paint" jump on initial open and when switching conversations.
  useLayoutEffect(() => {
    if (!conversation) {
      lastConversationIdRef.current = null;
      lastMessageCountRef.current = 0;
      setExpandedUserMessages({});
      return;
    }

    const { id, messages } = conversation;
    const count = messages.length;

    if (id !== lastConversationIdRef.current) {
      scrollToBottom('auto');
      lastConversationIdRef.current = id;
      lastMessageCountRef.current = count;
      setExpandedUserMessages({});
      return;
    }

    if (count > lastMessageCountRef.current && isNearBottomRef.current) {
      scrollToBottom('auto');
    }
    lastMessageCountRef.current = count;
  }, [conversation?.id, conversation?.messages?.length]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input);
      setInput('');
    }
  };

  const handleKeyDown = (e) => {
    // Submit on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  if (!conversation) {
    return (
      <div className="chat-interface">
        <div className="empty-state">
          <h2>Welcome to LLM Council</h2>
          <p>Create a new conversation to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-interface">
      <div className="messages-container" ref={messagesContainerRef} onScroll={updateNearBottom}>
        <MessagesView
          conversation={conversation}
          onToggleStage={onToggleStage}
          expandedUserMessages={expandedUserMessages}
          setExpandedUserMessages={setExpandedUserMessages}
          isLoading={isLoading}
          onResendMessage={onResendMessage}
        />
        <div ref={messagesEndRef} />
      </div>
      <form className="input-form" onSubmit={handleSubmit}>
        <textarea
          className="message-input"
          placeholder={
            conversation.messages.length === 0
              ? "Ask your question... (Shift+Enter for new line, Enter to send)"
              : "Ask a follow-up question... (Shift+Enter for new line, Enter to send)"
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          rows={3}
        />
        <button
          type="submit"
          className="send-button"
          disabled={!input.trim() || isLoading}
        >
          Send
        </button>
      </form>
    </div>
  );
}
