import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './ui/App.jsx';
import initNotifyClickHandler from './utils/notifyClickHandler'
import './index.css';

// initialize notification click handler (Electron)
initNotifyClickHandler()

createRoot(document.getElementById('root')).render(<App />);
