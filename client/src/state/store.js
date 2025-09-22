import { create } from "zustand";
import { io } from "socket.io-client";
import axios from "axios";

const initialConversations = {};

const resolveDmTitle = (users, otherUserId) => {
  const user = users.find((entry) => entry.id === otherUserId);
  return user ? `@${user.username}` : "Direct message";
};

const useStore = create((set, get) => ({
  serverUrl: import.meta.env.VITE_LGM_SERVER || "http://localhost:4000",
  token: null,
  user: null,
  socket: null,
  users: [],
  globalConversationId: null,
  activeConversationId: null,
  messages: {},
  typing: {},
  onlineUserIds: [],
  conversations: initialConversations,
  pendingDmUser: null,

  setAuth: (token, user) => set({ token, user }),
  setUsers: (users) =>
    set((state) => {
      const conversations = state.conversations || {};
      const nextConversations = Object.fromEntries(
        Object.entries(conversations).map(([id, conversation]) => {
          if (conversation.type !== "dm" || !conversation.otherUserId) {
            return [id, conversation];
          }
          return [
            id,
            {
              ...conversation,
              title: resolveDmTitle(users, conversation.otherUserId)
            }
          ];
        })
      );
      return { users, conversations: nextConversations };
    }),

  setActiveConversation: (id) => {
    const conversations = get().conversations;
    if (!id) return;
    if (!conversations[id]) {
      set({ activeConversationId: id });
      return;
    }
    const conversation = conversations[id];
    if (conversation.type === "dm") {
      const dmTitle = resolveDmTitle(get().users, conversation.otherUserId);
      set({
        activeConversationId: id,
        conversations: {
          ...conversations,
          [id]: { ...conversation, title: dmTitle }
        }
      });
      return;
    }
    set({ activeConversationId: id });
  },

  setTyping: (conversationId, isTyping) => {
    const socket = get().socket;
    if (!socket || !conversationId) return;
    socket.emit("typing", { conversationId, isTyping });
  },

  initSocket: async () => {
    if (get().socket) return;
    const token = get().token;
    if (!token) return;
    const server = get().serverUrl;
    const socket = io(server, { auth: { token } });

    set({ socket });

    socket.on("connect", async () => {
      socket.emit("init:request", {});
      const usersResponse = await axios.get(server + "/api/users");
      set((state) => {
        const nextUsers = usersResponse.data.users;
        const conversations = state.conversations || {};
        const nextConversations = Object.fromEntries(
          Object.entries(conversations).map(([id, conversation]) => {
            if (conversation.type !== "dm" || !conversation.otherUserId) {
              return [id, conversation];
            }
            return [
              id,
              {
                ...conversation,
                title: resolveDmTitle(nextUsers, conversation.otherUserId)
              }
            ];
          })
        );
        return { users: nextUsers, conversations: nextConversations };
      });
    });

    socket.on("init:response", ({ globalConversationId, messages }) => {
      set((state) => ({
        globalConversationId,
        activeConversationId: globalConversationId,
        messages: { ...state.messages, [globalConversationId]: messages },
        conversations: {
          ...state.conversations,
          [globalConversationId]: {
            id: globalConversationId,
            type: "global",
            title: "Global chat"
          }
        }
      }));
    });

    socket.on("message:new", (message) => {
      set((state) => {
        const existing = state.messages[message.conversationId] || [];
        return {
          messages: {
            ...state.messages,
            [message.conversationId]: [...existing, message]
          }
        };
      });
    });

    socket.on("typing:update", ({ conversationId, userIds }) => {
      set((state) => ({ typing: { ...state.typing, [conversationId]: userIds } }));
    });

    socket.on("presence:update", ({ onlineUserIds }) => set({ onlineUserIds }));

    socket.on("dm:opened", ({ conversationId, messages }) => {
      const pendingDmUser = get().pendingDmUser;
      set((state) => {
        const updatedConversations = { ...state.conversations };
        if (pendingDmUser) {
          const title = resolveDmTitle(state.users, pendingDmUser);
          updatedConversations[conversationId] = {
            id: conversationId,
            type: "dm",
            title,
            otherUserId: pendingDmUser
          };
        }
        return {
          activeConversationId: conversationId,
          messages: { ...state.messages, [conversationId]: messages },
          conversations: updatedConversations,
          pendingDmUser: null
        };
      });
      get().joinConversation(conversationId);
    });

    socket.on("messages:page", ({ conversationId, messages }) => {
      set((state) => ({
        messages: {
          ...state.messages,
          [conversationId]: [...messages, ...(state.messages