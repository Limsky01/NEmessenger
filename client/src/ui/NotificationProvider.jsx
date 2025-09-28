import React, { createContext, useCallback, useContext, useState } from 'react';
import CustomNotification from './CustomNotification.jsx';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);

  const showNotification = useCallback((title, message, duration = 4000) => {
    const id = Math.random().toString(36).slice(2);
    setNotifications((prev) => [...prev, { id, title, message, duration }]);
  }, []);

  const removeNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return (
    <NotificationContext.Provider value={showNotification}>
      {children}
      <div style={{ position: 'fixed', top: 24, right: 24, zIndex: 9999 }}>
        {notifications.map((n) => (
          <CustomNotification
            key={n.id}
            title={n.title}
            message={n.message}
            duration={n.duration}
            onClose={() => removeNotification(n.id)}
          />
        ))}
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
