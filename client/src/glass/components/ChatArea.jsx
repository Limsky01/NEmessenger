import React, { useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaHashtag,
  FaBell,
  FaPushpin,
  FaUserPlus,
  FaSearch,
  FaGift,
  FaSmile,
  FaFileImage,
  FaPlus
} from "react-icons/fa";
import useStore from "../../state/store";

const ChatShell = styled(motion.section)`
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: rgba(54, 57, 63, 0.6);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: ${(props) => props.theme.colors.glassShadow};
`;

const ChatHeader = styled.header`
  height: 54px;
  padding: 0 ${(props) => props.theme.spacing.md};
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(32, 34, 37, 0.75);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
`;

const HeaderCluster = styled.div`
  display: flex;
  align-items: center;
  gap: ${(props) => props.theme.spacing.sm};

  h3 {
    font-size: 16px;
    font-weight: 600;
    color: ${(props) => props.theme.colors.headerPrimary};
  }
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: ${(props) => props.theme.spacing.md};
  color: ${(props) => props.theme.colors.textMuted};

  svg {
    cursor: pointer;
    transition: color 0.2s ease;
  }

  svg:hover {
    color: ${(props) => props.theme.colors.textNormal};
  }
`;

const MessagesScroll = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: ${(props) => props.theme.spacing.lg} ${(props) => props.theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: ${(props) => props.theme.spacing.md};
`;

const MessageGroup = styled(motion.article)`
  display: flex;
  align-items: flex-start;
  gap: ${(props) => props.theme.spacing.sm};
`;

const Avatar = styled.div`
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  background: ${(props) =>
    props.$mine ? "rgba(67, 181, 129, 0.5)" : "rgba(114, 137, 218, 0.4)"};
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: ${(props) => props.theme.colors.glassShadow};
`;

const MessageContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: ${(props) => props.theme.spacing.xs};
`;

const MessageHeader = styled.div`
  display: flex;
  align-items: baseline;
  gap: ${(props) => props.theme.spacing.sm};

  h4 {
    font-size: 15px;
    font-weight: 600;
    color: ${(props) => props.theme.colors.headerPrimary};
  }

  span {
    font-size: 12px;
    color: ${(props) => props.theme.colors.textMuted};
  }
`;

const MessageBubble = styled.div`
  padding: ${(props) => props.theme.spacing.sm} ${(props) => props.theme.spacing.md};
  border-radius: ${(props) => props.theme.borderRadius.large};
  background: ${(props) =>
    props.$mine ? "rgba(67, 181, 129, 0.25)" : "rgba(255, 255, 255, 0.05)"};
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: ${(props) => props.theme.colors.glassShadow};
  white-space: pre-wrap;
  line-height: 1.45;
  font-size: 15px;
`;

const Composer = styled.form`
  padding: ${(props) => props.theme.spacing.md};
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(32, 34, 37, 0.8);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
`;

const InputWrapper = styled.div`
  display: flex;
  align-items: flex-end;
  gap: ${(props) => props.theme.spacing.sm};
  background: rgba(0, 0, 0, 0.25);
  border-radius: ${(props) => props.theme.borderRadius.large};
  padding: ${(props) => props.theme.spacing.sm} ${(props) => props.theme.spacing.md};
  border: 1px solid rgba(255, 255, 255, 0.08);
`;

const ComposerInput = styled.textarea`
  flex: 1;
  background: transparent;
  border: none;
  color: ${(props) => props.theme.colors.textNormal};
  font-size: 15px;
  resize: none;
  outline: none;
  max-height: 160px;
`;

const IconCluster = styled.div`
  display: flex;
  align-items: center;
  gap: ${(props) => props.theme.spacing.sm};
  color: ${(props) => props.theme.colors.textMuted};
`;

const TypingBadge = styled.div`
  padding: ${(props) => props.theme.spacing.xs} ${(props) => props.theme.spacing.sm};
  font-size: 12px;
  color: ${(props) => props.theme.colors.textMuted};
`;

const EmptyState = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: ${(props) => props.theme.spacing.sm};
  color: ${(props) => props.theme.colors.textMuted};
`;

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.3,
      staggerChildren: 0.05
    }
  }
};

const messageVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 260,
      damping: 20
    }
  }
};

const ChatArea = () => {
  const activeConversationId = useStore((state) => state.activeConversationId);
  const conversations = useStore((state) => state.conversations);
  const messages = useStore((state) => state.messages[activeConversationId] || []);
  const sendMessage = useStore((state) => state.sendMessage);
  const joinConversation = useStore((state) => state.joinConversation);
  const loadMore = useStore((state) => state.loadMore);
  const typing = useStore((state) => state.typing[activeConversationId] || []);
  const users = useStore((state) => state.users);
  const me = useStore((state) => state.user);
  const setTyping = useStore((state) => state.setTyping);

  const [content, setContent] = useState("");
  const listRef = useRef(null);
  const scrollAnchor = useRef(null);
  const [atTop, setAtTop] = useState(false);

  useEffect(() => {
    if (activeConversationId) {
      joinConversation(activeConversationId);
      setContent("");
    }
  }, [activeConversationId, joinConversation]);

  useEffect(() => {
    if (!atTop) {
      scrollAnchor.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, atTop]);

  useEffect(() => {
    if (!activeConversationId) return;
    const container = listRef.current;
    if (!container) return;
    const handleScroll = (event) => {
      const target = event.currentTarget;
      if (target.scrollTop === 0) {
        setAtTop(true);
        loadMore(activeConversationId);
      } else {
        setAtTop(false);
      }
    };
    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [activeConversationId, loadMore]);

  const conversationTitle = useMemo(() => {
    const conversation = conversations[activeConversationId];
    if (!conversation) return "conversation";
    if (conversation.type === "global") return "global";
    return conversation.title || "direct-message";
  }, [conversations, activeConversationId]);

  const resolvedMessages = useMemo(() => {
    const lookup = new Map(users.map((user) => [user.id, user]));
    return messages.map((message) => {
      const senderId = message.senderId || message.sender_id;
      const sender = lookup.get(senderId);
      const timestamp = message.createdAt || message.created_at;
      return {
        id: message.id,
        content: message.content,
        createdAt: timestamp ? new Date(timestamp) : null,
        senderId,
        sender
      };
    });
  }, [messages, users]);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!content.trim() || !activeConversationId) return;
    sendMessage(activeConversationId, content.trim());
    setTyping(activeConversationId, false);
    setContent("");
  };

  const typingNames = typing
    .map((id) => users.find((user) => user.id === id)?.username)
    .filter(Boolean);

  return (
    <ChatShell initial="hidden" animate="visible" variants={containerVariants}>
      <ChatHeader>
        <HeaderCluster>
          <FaHashtag size={16} />
          <h3>{conversationTitle}</h3>
        </HeaderCluster>
        <HeaderActions>
          <FaBell size={16} />
          <FaPushpin size={16} />
          <FaUserPlus size={16} />
          <FaSearch size={16} />
        </HeaderActions>
      </ChatHeader>

      {resolvedMessages.length === 0 ? (
        <EmptyState>
          <FaHashtag size={48} />
          <div>Start the conversation in #{conversationTitle}</div>
        </EmptyState>
      ) : (
        <MessagesScroll ref={listRef}>
          <AnimatePresence initial={false}>
            {resolvedMessages.map((message) => {
              const mine = message.senderId === me?.id;
              return (
                <MessageGroup
                  key={message.id}
                  variants={messageVariants}
                  initial="hidden"
                  animate="visible"
                  exit={{ opacity: 0, y: -10 }}
                >
                  <Avatar $mine={mine}>
                    {(message.sender?.username || "?").charAt(0).toUpperCase()}
                  </Avatar>
                  <MessageContent>
                    <MessageHeader>
                      <h4>{message.sender?.username || "Unknown"}</h4>
                      {message.createdAt && (
                        <span>{message.createdAt.toLocaleTimeString()}</span>
                      )}
                    </MessageHeader>
                    <MessageBubble $mine={mine}>{message.content}</MessageBubble>
                  </MessageContent>
                </MessageGroup>
              );
            })}
          </AnimatePresence>
          <div ref={scrollAnchor} />
        </MessagesScroll>
      )}

      <Composer onSubmit={handleSubmit}>
        <InputWrapper>
          <IconCluster>
            <FaPlus size={18} />
          </IconCluster>
          <ComposerInput
            value={content}
            onChange={(event) => {
              setContent(event.target.value);
              setTyping(activeConversationId, true);
            }}
            onBlur={() => setTyping(activeConversationId, false)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSubmit(event);
              }
            }}
            placeholder={activeConversationId ? `Message #${conversationTitle}` : "Select a channel to start chatting"}
            rows={1}
          />
          <IconCluster>
            <FaGift size={18} />
            <FaFileImage size={18} />
            <FaSmile size={18} />
          </IconCluster>
        </InputWrapper>
        {typingNames.length > 0 && (
          <TypingBadge>
            {typingNames.length === 1
              ? `${typingNames[0]} is typing...`
              : `${typingNames.length} people are typing...`}
          </TypingBadge>
        )}
      </Composer>
    </ChatShell>
  );
};

export default ChatArea;
