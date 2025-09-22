import React, { useMemo } from "react";
import styled from "styled-components";
import { motion } from "framer-motion";
import { FaPlus, FaCompass, FaDiscord } from "react-icons/fa";
import useStore from "../../state/store";

const ServerListContainer = styled(motion.aside)`
  width: 72px;
  height: 100%;
  padding: ${(props) => props.theme.spacing.sm} 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  background-color: rgba(32, 34, 37, 0.7);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: ${(props) => props.theme.colors.glassShadow};
  overflow-y: auto;
`;

const ServerIcon = styled(motion.button)`
  width: 48px;
  height: 48px;
  margin-bottom: ${(props) => props.theme.spacing.sm};
  border-radius: ${(props) => (props.$active ? "16px" : "50%")} ;
  border: none;
  outline: none;
  cursor: pointer;
  background: ${(props) =>
    props.$active ? props.theme.colors.blurple : props.theme.colors.backgroundSecondary};
  color: ${(props) => props.theme.colors.textNormal};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  transition: border-radius 0.2s ease, background 0.2s ease, transform 0.2s ease;

  &:hover {
    border-radius: 16px;
    background: ${(props) => props.theme.colors.backgroundAccent};
  }
`;

const Separator = styled.div`
  width: 32px;
  height: 2px;
  margin: ${(props) => props.theme.spacing.xs} 0;
  background: ${(props) => props.theme.colors.backgroundTertiary};
`;

const containerVariants = {
  hidden: { x: -40, opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 120,
      damping: 18
    }
  }
};

const iconVariants = {
  hover: { scale: 1.08 },
  tap: { scale: 0.95 }
};

const ServerList = () => {
  const me = useStore((state) => state.user);
  const users = useStore((state) => state.users);
  const conversations = useStore((state) => state.conversations);
  const activeConversationId = useStore((state) => state.activeConversationId);
  const globalConversationId = useStore((state) => state.globalConversationId);
  const setActiveConversation = useStore((state) => state.setActiveConversation);
  const openDm = useStore((state) => state.openDm);

  const dmEntries = useMemo(() => {
    return users
      .filter((user) => user.id !== me?.id)
      .map((user) => {
        const match = Object.values(conversations).find(
          (conversation) => conversation.type === "dm" && conversation.otherUserId === user.id
        );
        return {
          user,
          conversationId: match?.id
        };
      });
  }, [users, me?.id, conversations]);

  return (
    <ServerListContainer initial="hidden" animate="visible" variants={containerVariants}>
      <ServerIcon
        type="button"
        $active={activeConversationId === globalConversationId}
        variants={iconVariants}
        whileHover="hover"
        whileTap="tap"
        onClick={() => globalConversationId && setActiveConversation(globalConversationId)}
        aria-label="Global chat"
      >
        <FaDiscord />
      </ServerIcon>

      <Separator />

      {dmEntries.map(({ user, conversationId }) => (
        <ServerIcon
          key={user.id}
          type="button"
          $active={conversationId && conversationId === activeConversationId}
          variants={iconVariants}
          whileHover="hover"
          whileTap="tap"
          onClick={() => {
            if (conversationId) {
              setActiveConversation(conversationId);
            } else {
              openDm(user.id);
            }
          }}
          aria-label={`Direct messages with ${user.username}`}
        >
          {user.username.charAt(0).toUpperCase()}
        </ServerIcon>
      ))}

      <Separator />

      <ServerIcon type="button" variants={iconVariants} whileHover="hover" whileTap="tap" aria-label="Add server">
        <FaPlus />
      </ServerIcon>

      <ServerIcon type="button" variants={iconVariants} whileHover="hover" whileTap="tap" aria-label="Explore servers">
        <FaCompass />
      </ServerIcon>
    </ServerListContainer>
  );
};

export default ServerList;
