import React, { useMemo } from "react";
import styled from "styled-components";
import { motion } from "framer-motion";
import { FaCircle } from "react-icons/fa";
import useStore from "../../state/store";

const UserPane = styled(motion.aside)`
  width: 280px;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: rgba(32, 34, 37, 0.65);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: ${(props) => props.theme.colors.glassShadow};
  overflow-y: auto;
  padding: ${(props) => props.theme.spacing.lg} ${(props) => props.theme.spacing.md};
`;

const SectionTitle = styled.div`
  text-transform: uppercase;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: ${(props) => props.theme.colors.textMuted};
  margin-bottom: ${(props) => props.theme.spacing.sm};
`;

const UserCard = styled(motion.button)`
  width: 100%;
  background: ${(props) => (props.$active ? "rgba(114, 137, 218, 0.25)" : "rgba(0, 0, 0, 0.15)")};
  border-radius: ${(props) => props.theme.borderRadius.large};
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: ${(props) => props.theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: ${(props) => props.theme.spacing.xs};
  text-align: left;
  cursor: pointer;
  color: ${(props) => props.theme.colors.textNormal};
  transition: transform 0.2s ease, background 0.2s ease;

  &:hover {
    background: rgba(114, 137, 218, 0.35);
    transform: translateY(-2px);
  }
`;

const UserRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${(props) => props.theme.spacing.sm};
`;

const Avatar = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow: ${(props) => props.theme.colors.glassShadow};
`;

const Name = styled.span`
  font-size: 15px;
  font-weight: 600;
`;

const Status = styled.span`
  display: inline-flex;
  align-items: center;
  gap: ${(props) => props.theme.spacing.xs};
  font-size: 12px;
  color: ${(props) =>
    props.$online ? props.theme.colors.online : props.theme.colors.textMuted};
`;

const Bio = styled.span`
  font-size: 13px;
  color: ${(props) => props.theme.colors.textMuted};
`;

const containerVariants = {
  hidden: { x: 40, opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 120,
      damping: 18,
      delay: 0.15
    }
  }
};

const cardVariants = {
  hover: { scale: 1.02 },
  tap: { scale: 0.98 }
};

const UserList = () => {
  const me = useStore((state) => state.user);
  const users = useStore((state) => state.users);
  const onlineUserIds = useStore((state) => state.onlineUserIds);
  const openDm = useStore((state) => state.openDm);
  const setActiveConversation = useStore((state) => state.setActiveConversation);
  const activeConversationId = useStore((state) => state.activeConversationId);
  const conversations = useStore((state) => state.conversations);

  const entries = useMemo(() => {
    return users
      .filter((user) => user.id !== me?.id)
      .map((user) => {
        const conversation = Object.values(conversations).find(
          (c) => c.type === "dm" && c.otherUserId === user.id
        );
        return {
          user,
          conversationId: conversation?.id,
          online: onlineUserIds.includes(user.id)
        };
      });
  }, [users, me?.id, conversations, onlineUserIds]);

  return (
    <UserPane initial="hidden" animate="visible" variants={containerVariants}>
      <SectionTitle>People</SectionTitle>
      {entries.map(({ user, conversationId, online }) => (
        <UserCard
          key={user.id}
          type="button"
          $active={conversationId && conversationId === activeConversationId}
          variants={cardVariants}
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
          <UserRow>
            <Avatar>{user.username.charAt(0).toUpperCase()}</Avatar>
            <Name>@{user.username}</Name>
          </UserRow>
          <Status $online={online}>
            <FaCircle size={8} />
            {online ? "online" : "offline"}
          </Status>
          <Bio>Start a glass-styled direct message</Bio>
        </UserCard>
      ))}
    </UserPane>
  );
};

export default UserList;
