import React, { useEffect } from 'react';

export default function CustomNotification({ title, message, onClose, duration = 4000 }) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  return (
    <div style={{
      position: 'fixed',
      top: 24,
      right: 24,
      zIndex: 9999,
      minWidth: 280,
      maxWidth: 360,
      background: 'rgba(30,32,40,0.98)',
      color: '#fff',
      borderRadius: 18,
      boxShadow: '0 4px 32px 0 #0008',
      padding: '18px 24px',
      marginBottom: 16,
      fontFamily: 'inherit',
      fontSize: 15,
      lineHeight: 1.5,
      border: '1px solid #fff2',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      cursor: 'pointer',
      transition: 'opacity 0.2s',
    }} onClick={onClose}>
      <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 2 }}>{title}</div>
      <div style={{ opacity: 0.92 }}>{message}</div>
    </div>
  );
}
