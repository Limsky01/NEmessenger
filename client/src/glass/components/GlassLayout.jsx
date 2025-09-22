import React from "react";
import styled from "styled-components";
import { motion } from "framer-motion";
import ServerList from "./ServerList";
import ChannelList from "./ChannelList";
import ChatArea from "./ChatArea";
import UserList from "./UserList";

const LayoutFrame = styled(motion.div)`
  display: flex;
  width: 100%;
  height: 100%;
  position: relative;
  background: rgba(0, 0, 0, 0.2);
`;

const layoutVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.4,
      when: "beforeChildren"
    }
  }
};

const GlassLayout = () => (
  <LayoutFrame initial="hidden" animate="visible" variants={layoutVariants}>
    <ServerList />
    <ChannelList />
    <ChatArea />
    <UserList />
  </LayoutFrame>
);

export default GlassLayout;
