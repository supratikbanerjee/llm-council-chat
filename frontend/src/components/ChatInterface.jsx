import { useState, useEffect, useRef, memo } from 'react';
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
      {conversation.messages.map((msg, index) => (
        <div key={index} className="message-group">
          {msg.role === 'user' ? (
            <div className="user-message">
              <div className="message-label">
                You {msg.failed && <span className="message-failed">[FAILED]</span>}
              </div>
              <div className="message-content">
                <div
                  className={`markdown-content ${
                    expandedUserMessages[index] ? '' : 'message-collapsed'
                  }`}
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeRaw, rehypeKatex]}
                  >
                    {normalizeMathDelimiters(msg.content)}
                  </ReactMarkdown>
                </div>
                {msg.content &&
                  (msg.content.split('\n').length > 5 || msg.content.length > 400) && (
                  <button
                    type="button"
                    className="message-toggle"
                    onClick={() =>
                      setExpandedUserMessages((prev) => ({
                        ...prev,
                        [index]: !prev[index],
                      }))
                    }
                  >
                    {expandedUserMessages[index] ? 'Show less' : 'Show more'}
                  </button>
                )}
                {index === lastUserIndex && (
                  <button
                    type="button"
                    className="message-resend"
                    onClick={() => onResendMessage?.(index)}
                    disabled={isLoading}
                  >
                    Resend
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="assistant-message">
              <div className="message-label">LLM Council</div>
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
                const stage3Failed = !!msg.failedStages?.stage3 || isFailureText(msg.stage3?.response);

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
          )}
        </div>
      ))}

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

  const scrollToBottom = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  const updateNearBottom = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const threshold = 80;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distanceFromBottom < threshold;
  };

  useEffect(() => {
    if (!conversation) {
      lastConversationIdRef.current = null;
      lastMessageCountRef.current = 0;
      setExpandedUserMessages({});
      return;
    }

    const { id, messages } = conversation;
    const count = messages.length;

    if (id !== lastConversationIdRef.current) {
      scrollToBottom();
      lastConversationIdRef.current = id;
      lastMessageCountRef.current = count;
      setExpandedUserMessages({});
      return;
    }

    if (count > lastMessageCountRef.current && isNearBottomRef.current) {
      scrollToBottom();
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
