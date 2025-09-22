import React, { useMemo, useState } from "react";
import styled from "styled-components";
import { motion } from "framer-motion";
import {
  FaChevronDown,
  FaHashtag,
  FaUser,
  FaMicrophone,
  FaHeadphones,
  FaCog,
  FaCircle
} from "react-icons/fa";
import useStore from "../../state/store";

const ChannelPane = styled(motion.section)`
  width: 240px;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: rgba(47, 49, 54, 0.7);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: ${(props) => props.theme.colors.glassShadow};
`;

const PaneHeader = styled.header`
  height: 48px;
  padding: 0 ${(props) => props.theme.spacing.md};
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(32, 34, 37, 0.7);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);

  h2 {
    font-size: 16px;
    font-weight: 600;
    color: ${(props) => props.theme.colors.headerPrimary};
  }
`;

const ChannelsScroll = styled.div`
  flex: 1;
  padding: ${(props) => props.theme.spacing.md};
  overflow-y: auto;
`;

const CategoryHeader = styled.button`
  display: flex;
  align-items: center;
  gap: ${(props) => props.theme.spacing.xs};
  margin-bottom: ${(props) => props.theme.spacing.xs};
  cursor: pointer;
  border: none;
  background: transparent;
  color: ${(props) => props.theme.colors.textMuted};
  text-transform: uppercase;
  font-weight: 600;
  font-size: 12px;
  letter-spacing: 0.04em;

  svg {
    transform: ${(props) => (props.$expanded ? "rotate(0deg)" : "rotate(-90deg)")};
    transition: transform 0.2s ease;
  }

  &:hover {
    color: ${(props) => props.theme.colors.textNormal};
  }
`;

const ChannelItem = styled(motion.button)`
  width: 100%;
  padding: 0 ${(props) => props.theme.spacing.sm};
  height: 32px;
  border-radius: ${(props) => props.theme.borderRadius.medium};
  display: flex;
  align-items: center;
  gap: ${(props) => props.theme.spacing.sm};
  border: none;
  background: ${(props) => (props.$active ? "rgba(79, 84, 92, 0.45)" : "transparent")};
  color: ${(props) => (props.$active ? props.theme.colors.textNormal : props.theme.colors.textMuted)};
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s ease, color 0.2s ease;
  text-align: left;

  &:hover {
    background: rgba(79, 84, 92, 0.35);
    color: ${(props) => props.theme.colors.textNormal};
  }
`;

const StatusIndicator = styled.span`
  display: inline-flex;
  align-items: center;
  gap: ${(props) => props.theme.spacing.xs};
  margin-left: auto;
  font-size: 12px;
  color: ${(props) =>
    props.$online ? props.theme.colors.online : props.theme.colors.textMuted};
`;

const UserFooter = styled.footer`
  height: 54px;
  padding: ${(props) => props.theme.spacing.sm};
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(32, 34, 37, 0.75);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
`;

const UserBlock = styled.div`
  display: flex;
  align-items: center;
  gap: ${(props) => props.theme.spacing.sm};
`;

const Avatar = styled.div`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  color: white;
  background: rgba(114, 137, 218, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: ${(props) => props.theme.colors.glassShadow};
`;

const UserName = styled.div`
  display: flex;
  flex-direction: column;
  line-height: 1.2;
`;

const UserPrimary = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: ${(props) => props.theme.colors.headerPrimary};
`;

const UserSecondary = styled.span`
  font-size: 12px;
  color: ${(props) => props.theme.colors.textMuted};
`;

const UserControls = styled.div`
  display: flex;
  align-items: center;
  gap: ${(props) => props.theme.spacing.sm};
  color: ${(props) => props.theme.colors.textMuted};

  svg {
    cursor: pointer;
    transition: color 0.2s ease;
  }

  svg:hover {
    color: ${(props) => props.theme.colors.textNormal};
  }
`;

const containerVariants = {
  hidden: { x: -60, opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 120,
      damping: 18,
      delay: 0.1
    }
  }
};

const itemVariants = {
  hover: { x: 4 },
  tap: { scale: 0.98 }
};

const ChannelList = () => {
  const me = useStore((state) => state.user);
  const users = useStore((state) => state.users);
  const activeConversationId = useStore((state) => state.activeConversationId);
  const globalConversationId = useStore((state) => state.globalConversationId);
  const setActiveConversation = useStore((state) => state.setActiveConversation);
  const openDm = useStore((state) => state.openDm);
  const onlineUserIds = useStore((state) => state.onlineUserIds);
  const conversations = useStore((state) => state.conversations);
  const typing = useStore((state) => state.typing);

  const [expanded, setExpanded] = useState({ text: true, dm: true });

  const toggleSection = (section) => {
    setExpanded((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const dmEntries = useMemo(() => {
    const typingEntries = typing || {};
    return users
      .filter((user) => user.id !== me?.id)
      .map((user) => {
        const conversation = Object.values(conversations).find(
          (c) => c.type === "dm" && c.otherUserId === user.id
        );
        const conversationId = conversation?.id;
        const typingUsers = conversationId ? typingEntries[conversationId] || [] : [];
        return {
          user,
          conversationId,
          online: onlineUserIds.includes(user.id),
          isTyping: typingUsers.some((id) => id === user.id)
        };
      });
  }, [users, me?.id, conversations, onlineUserIds, typing]);

  return (
    <ChannelPane initial="hidden" animate="visible" variants={containerVariants}>
      <PaneHeader>
        <h2>Liquid Glass</h2>
      </PaneHeader>

      <ChannelsScroll>
        <CategoryHeader
          type="button"
          onClick={() => toggleSection("text")}
          $expanded={expanded.text}
        >
          <FaChevronDown size={10} />
          Text Channels
        </CategoryHeader>
        {expanded.text && (
          <ChannelItem
            type="button"
            $active={activeConversationId === globalConversationId}
            variants={itemVariants}
            whileHover="hover"
            whileTap="tap"
            onClick={() => globalConversationId && setActiveConversation(globalConversationId)}
          >
            <FaHashtag size={14} />
            global
          </ChannelItem>
        )}

        <CategoryHeader
          type="button"
          onClick={() => toggleSection("dm")}
          $expanded={expanded.dm}
          style={{ marginTop: "16px" }}
        >
          <FaChevronDown size={10} />
          Direct Messages
        </CategoryHeader>
        {expanded.dm &&
          dmEntries.map(({ user, conversationId, online, isTyping }) => (
            <ChannelItem
              key={user.id}
              type="button"
              $active={conversationId && conversationId === activeConversationId}
              variants={itemVariants}
              whileHover="hover"
              whileTap="tap"
              onClick={() => {
                if (conversationId) {
                  setActiveConversation(conversationId);
                } else {
                  openDm(user.id);
                }
              }}
            >
              <FaUser size={14} />
              {user.username}
              <StatusIndicator $online={online}>
                <FaCircle size={8} />
                {isTyping ? "typing" : online ? "online" : "offline"}
              </StatusIndicator>
            </ChannelItem>
          ))}
      </ChannelsScroll>

      <UserFooter>
        <UserBlock>
          <Avatar>{me?.username?.charAt(0).toUpperCase()}</Avatar>
          <UserName>
            <UserPrimary>{me?.username}</UserPrimary>
            <UserSecondary>Connected</UserSecondary>
          </UserName>
        </UserBlock>
        <UserControls>
          <FaMicrophone size={14} />
          <FaHeadphones size={14} />
          <FaCog size={14} />
        </UserControls>
      </UserFooter>
    </ChannelPane>
  );
};

export default ChannelList;
