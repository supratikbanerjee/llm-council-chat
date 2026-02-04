import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatInterface from './components/ChatInterface';
import { api } from './api';
import './App.css';

function App() {
  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, []);

  // Load conversation details when selected
  useEffect(() => {
    if (currentConversationId) {
      loadConversation(currentConversationId);
    }
  }, [currentConversationId]);

  const loadConversations = async () => {
    try {
      const convs = await api.listConversations();
      setConversations(convs);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  };

  const loadConversation = async (id) => {
    try {
      const conv = await api.getConversation(id);
      setCurrentConversation(conv);
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  };

  const handleNewConversation = async () => {
    try {
      const newConv = await api.createConversation();
      setConversations([
        { id: newConv.id, created_at: newConv.created_at, message_count: 0 },
        ...conversations,
      ]);
      setCurrentConversationId(newConv.id);
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };

  const handleRenameConversation = async (conv) => {
    const nextTitle = window.prompt('Rename conversation', conv.title || '');
    if (nextTitle === null) return;
    const trimmed = nextTitle.trim();
    if (!trimmed) return;
    try {
      await api.updateConversationTitle(conv.id, trimmed);
      await loadConversations();
      if (conv.id === currentConversationId) {
        await loadConversation(conv.id);
      }
    } catch (error) {
      console.error('Failed to rename conversation:', error);
    }
  };

  const handleDeleteConversation = async (conv) => {
    const confirmed = window.confirm(`Delete "${conv.title || 'New Conversation'}"? This cannot be undone.`);
    if (!confirmed) return;
    try {
      await api.deleteConversation(conv.id);
      await loadConversations();
      if (conv.id === currentConversationId) {
        setCurrentConversationId(null);
        setCurrentConversation(null);
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  };

  const handleSelectConversation = (id) => {
    setCurrentConversationId(id);
  };

  const handleToggleStage = (messageIndex, stage) => {
    setCurrentConversation((prev) => {
      if (!prev) return prev;
      const messages = [...prev.messages];
      const msg = messages[messageIndex];
      if (!msg || msg.role !== 'assistant') return prev;
      const nextStage = msg.expandedStage === stage ? null : stage;
      messages[messageIndex] = { ...msg, expandedStage: nextStage };
      return { ...prev, messages };
    });
  };

  const handleSendMessage = async (content) => {
    if (!currentConversationId) return;

    setIsLoading(true);
    try {
      // Optimistically add user message to UI
      const userMessage = { role: 'user', content };
      setCurrentConversation((prev) => ({
        ...prev,
        messages: [...prev.messages, userMessage],
      }));

      // Create a partial assistant message that will be updated progressively
      const assistantMessage = {
        role: 'assistant',
        stage1: null,
        stage2: null,
        stage3: null,
        metadata: null,
        failed: false,
        failedStages: {
          stage1: false,
          stage2: false,
          stage3: false,
        },
        loading: {
          stage1: false,
          stage2: false,
          stage3: false,
        },
      };

      // Add the partial assistant message
      setCurrentConversation((prev) => {
        const collapsed = prev.messages.map((msg) => {
          if (msg.role !== 'assistant') return msg;
          return { ...msg, expandedStage: null };
        });
        return {
          ...prev,
          messages: [...collapsed, assistantMessage],
        };
      });

      // Send message with streaming
      await api.sendMessageStream(currentConversationId, content, (eventType, event) => {
        switch (eventType) {
          case 'stage1_start':
            setCurrentConversation((prev) => {
              const messages = prev.messages.map((msg, idx) => {
                if (msg.role !== 'assistant') return msg;
                return {
                  ...msg,
                  expandedStage: idx === prev.messages.length - 1 ? 'stage1' : null,
                };
              });
              const lastMsg = messages[messages.length - 1];
              lastMsg.loading.stage1 = true;
              lastMsg.failedStages.stage1 = false;
              return { ...prev, messages };
            });
            break;

          case 'stage1_complete':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.stage1 = event.data;
              lastMsg.loading.stage1 = false;
              lastMsg.failedStages.stage1 = false;
              return { ...prev, messages };
            });
            break;

          case 'stage2_start':
            setCurrentConversation((prev) => {
              const messages = prev.messages.map((msg, idx) => {
                if (msg.role !== 'assistant') return msg;
                return {
                  ...msg,
                  expandedStage: idx === prev.messages.length - 1 ? 'stage2' : null,
                };
              });
              const lastMsg = messages[messages.length - 1];
              lastMsg.loading.stage2 = true;
              lastMsg.failedStages.stage2 = false;
              return { ...prev, messages };
            });
            break;

          case 'stage2_complete':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.stage2 = event.data;
              lastMsg.metadata = event.metadata;
              lastMsg.loading.stage2 = false;
              lastMsg.failedStages.stage2 = false;
              return { ...prev, messages };
            });
            break;

          case 'stage3_start':
            setCurrentConversation((prev) => {
              const messages = prev.messages.map((msg, idx) => {
                if (msg.role !== 'assistant') return msg;
                return {
                  ...msg,
                  expandedStage: idx === prev.messages.length - 1 ? 'stage3' : null,
                };
              });
              const lastMsg = messages[messages.length - 1];
              lastMsg.loading.stage3 = true;
              lastMsg.failedStages.stage3 = false;
              return { ...prev, messages };
            });
            break;

          case 'stage3_complete':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.stage3 = event.data;
              lastMsg.loading.stage3 = false;
              lastMsg.failedStages.stage3 = false;
              return { ...prev, messages };
            });
            break;

          case 'title_complete':
            // Reload conversations to get updated title
            loadConversations();
            break;

          case 'complete':
            // Stream complete, reload conversations list
            loadConversations();
            setIsLoading(false);
            break;

          case 'error':
            console.error('Stream error:', event.message);
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastIndex = messages.length - 1;
              const lastMsg = messages[lastIndex];
              if (lastMsg && lastMsg.role === 'assistant') {
                lastMsg.failed = true;
                lastMsg.loading.stage1 = false;
                lastMsg.loading.stage2 = false;
                lastMsg.loading.stage3 = false;
                lastMsg.failedStages.stage1 = !lastMsg.stage1;
                lastMsg.failedStages.stage2 = !lastMsg.stage2;
                lastMsg.failedStages.stage3 = !lastMsg.stage3;
              }
              const userIndex = lastIndex - 1;
              const userMsg = messages[userIndex];
              if (userMsg && userMsg.role === 'user') {
                userMsg.failed = true;
              }
              return { ...prev, messages };
            });
            setIsLoading(false);
            break;

          default:
            console.log('Unknown event type:', eventType);
        }
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      // Remove optimistic messages on error
      setCurrentConversation((prev) => ({
        ...prev,
        messages: prev.messages.slice(0, -2),
      }));
      setIsLoading(false);
    }
  };

  const handleResendMessage = async (messageIndex) => {
    if (!currentConversationId || !currentConversation) return;
    if (isLoading) return;

    const messages = currentConversation.messages;
    const lastUserIndex = messages
      .map((msg, idx) => (msg.role === 'user' ? idx : -1))
      .reduce((acc, idx) => (idx > acc ? idx : acc), -1);

    if (messageIndex !== lastUserIndex) {
      return;
    }

    const userMsg = messages[messageIndex];
    if (!userMsg || userMsg.role !== 'user') return;

    setIsLoading(true);

    try {
      // Trim conversation to the target user message and add a fresh assistant placeholder
      const assistantMessage = {
        role: 'assistant',
        stage1: null,
        stage2: null,
        stage3: null,
        metadata: null,
        failed: false,
        failedStages: {
          stage1: false,
          stage2: false,
          stage3: false,
        },
        loading: {
          stage1: false,
          stage2: false,
          stage3: false,
        },
      };

      setCurrentConversation((prev) => ({
        ...prev,
        messages: [...prev.messages.slice(0, messageIndex + 1), assistantMessage],
      }));

      await api.sendMessageStream(
        currentConversationId,
        userMsg.content,
        (eventType, event) => {
          switch (eventType) {
            case 'stage1_start':
              setCurrentConversation((prev) => {
                const msgs = [...prev.messages];
                const lastMsg = msgs[msgs.length - 1];
                lastMsg.loading.stage1 = true;
                lastMsg.expandedStage = 'stage1';
                return { ...prev, messages: msgs };
              });
              break;
            case 'stage1_complete':
              setCurrentConversation((prev) => {
                const msgs = [...prev.messages];
                const lastMsg = msgs[msgs.length - 1];
                lastMsg.stage1 = event.data;
                lastMsg.loading.stage1 = false;
                return { ...prev, messages: msgs };
              });
              break;
            case 'stage2_start':
              setCurrentConversation((prev) => {
                const msgs = [...prev.messages];
                const lastMsg = msgs[msgs.length - 1];
                lastMsg.loading.stage2 = true;
                lastMsg.expandedStage = 'stage2';
                return { ...prev, messages: msgs };
              });
              break;
            case 'stage2_complete':
              setCurrentConversation((prev) => {
                const msgs = [...prev.messages];
                const lastMsg = msgs[msgs.length - 1];
                lastMsg.stage2 = event.data;
                lastMsg.metadata = event.metadata;
                lastMsg.loading.stage2 = false;
                return { ...prev, messages: msgs };
              });
              break;
            case 'stage3_start':
              setCurrentConversation((prev) => {
                const msgs = [...prev.messages];
                const lastMsg = msgs[msgs.length - 1];
                lastMsg.loading.stage3 = true;
                lastMsg.expandedStage = 'stage3';
                return { ...prev, messages: msgs };
              });
              break;
            case 'stage3_complete':
              setCurrentConversation((prev) => {
                const msgs = [...prev.messages];
                const lastMsg = msgs[msgs.length - 1];
                lastMsg.stage3 = event.data;
                lastMsg.loading.stage3 = false;
                return { ...prev, messages: msgs };
              });
              break;
            case 'title_complete':
              loadConversations();
              break;
            case 'complete':
              loadConversations();
              setIsLoading(false);
              break;
            case 'error':
              console.error('Stream error:', event.message);
              setCurrentConversation((prev) => {
                const msgs = [...prev.messages];
                const lastMsg = msgs[msgs.length - 1];
                if (lastMsg && lastMsg.role === 'assistant') {
                  lastMsg.failed = true;
                  lastMsg.loading.stage1 = false;
                  lastMsg.loading.stage2 = false;
                  lastMsg.loading.stage3 = false;
                  lastMsg.failedStages.stage1 = !lastMsg.stage1;
                  lastMsg.failedStages.stage2 = !lastMsg.stage2;
                  lastMsg.failedStages.stage3 = !lastMsg.stage3;
                }
                const userIndex = msgs.length - 2;
                const uMsg = msgs[userIndex];
                if (uMsg && uMsg.role === 'user') {
                  uMsg.failed = true;
                }
                return { ...prev, messages: msgs };
              });
              setIsLoading(false);
              break;
            default:
              console.log('Unknown event type:', eventType);
          }
        },
        { resend_index: messageIndex }
      );
    } catch (error) {
      console.error('Failed to resend message:', error);
      setIsLoading(false);
    }
  };

  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        currentConversationId={currentConversationId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        onRenameConversation={handleRenameConversation}
        onDeleteConversation={handleDeleteConversation}
      />
      <ChatInterface
        conversation={currentConversation}
        onSendMessage={handleSendMessage}
        isLoading={isLoading}
        onToggleStage={handleToggleStage}
        onResendMessage={handleResendMessage}
      />
    </div>
  );
}

export default App;
