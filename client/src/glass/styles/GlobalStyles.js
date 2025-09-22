import { createGlobalStyle } from "styled-components";

const GlobalStyles = createGlobalStyle`
  :root {
    --glass-background: rgba(255, 255, 255, 0.1);
    --glass-border: rgba(255, 255, 255, 0.2);
    --glass-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37);
    --glass-blur: 12px;

    --background-primary: rgba(54, 57, 63, 0.6);
    --background-secondary: rgba(47, 49, 54, 0.6);
    --background-tertiary: rgba(32, 34, 37, 0.6);
    --background-accent: rgba(114, 137, 218, 0.7);

    --text-normal: #dcddde;
    --text-muted: #72767d;
    --text-link: #00b0f4;

    --interactive-normal: #b9bbbe;
    --interactive-hover: #dcddde;
    --interactive-active: #ffffff;
    --interactive-muted: #4f545c;

    --header-primary: #ffffff;
    --header-secondary: #b9bbbe;

    --channeltextarea-background: rgba(64, 68, 75, 0.6);

    --transition-short: 0.15s ease;
    --transition-medium: 0.25s ease;
    --transition-long: 0.3s cubic-bezier(0.4, 0, 0.2, 1);

    --spacing-xs: 4px;
    --spacing-sm: 8px;
    --spacing-md: 16px;
    --spacing-lg: 24px;
    --spacing-xl: 32px;
  }

  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  html,
  body {
    height: 100%;
    width: 100%;
    overflow: hidden;
    color: var(--text-normal);
    background: linear-gradient(135deg, #8a2be2, #4b0082);
    background-attachment: fixed;
    font-family: 'Catamaran', sans-serif;
  }

  #root {
    height: 100%;
    width: 100%;
  }

  .glass {
    background: var(--glass-background);
    backdrop-filter: blur(var(--glass-blur));
    -webkit-backdrop-filter: blur(var(--glass-blur));
    border: 1px solid var(--glass-border);
    box-shadow: var(--glass-shadow);
  }

  ::-webkit-scrollbar {
    width: 8px;
  }

  ::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.1);
    border-radius: 10px;
  }

  ::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 10px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes slideIn {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  @keyframes pulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.05); }
    100% { transform: scale(1); }
  }

  @keyframes glow {
    0% { box-shadow: 0 0 5px rgba(114, 137, 218, 0.5); }
    50% { box-shadow: 0 0 20px rgba(114, 137, 218, 0.8); }
    100% { box-shadow: 0 0 5px rgba(114, 137, 218, 0.5); }
  }
`;

export default GlobalStyles;
