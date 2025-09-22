export const theme = {
  colors: {
    glassBackground: "rgba(255, 255, 255, 0.1)",
    glassBorder: "rgba(255, 255, 255, 0.2)",
    glassShadow: "0 8px 32px 0 rgba(31, 38, 135, 0.37)",

    backgroundPrimary: "rgba(54, 57, 63, 0.6)",
    backgroundSecondary: "rgba(47, 49, 54, 0.6)",
    backgroundTertiary: "rgba(32, 34, 37, 0.6)",
    backgroundAccent: "rgba(114, 137, 218, 0.7)",

    textNormal: "#dcddde",
    textMuted: "#72767d",
    textLink: "#00b0f4",

    interactiveNormal: "#b9bbbe",
    interactiveHover: "#dcddde",
    interactiveActive: "#ffffff",
    interactiveMuted: "#4f545c",

    headerPrimary: "#ffffff",
    headerSecondary: "#b9bbbe",

    channelTextareaBackground: "rgba(64, 68, 75, 0.6)",

    online: "#43b581",
    idle: "#faa61a",
    dnd: "#f04747",
    offline: "#747f8d",

    blurple: "rgba(114, 137, 218, 0.8)",
    green: "rgba(67, 181, 129, 0.8)",
    yellow: "rgba(250, 166, 26, 0.8)",
    red: "rgba(240, 71, 71, 0.8)",
    grey: "rgba(116, 127, 141, 0.8)"
  },
  transitions: {
    short: "0.15s ease",
    medium: "0.25s ease",
    long: "0.3s cubic-bezier(0.4, 0, 0.2, 1)"
  },
  spacing: {
    xs: "4px",
    sm: "8px",
    md: "16px",
    lg: "24px",
    xl: "32px"
  },
  borderRadius: {
    small: "3px",
    medium: "5px",
    large: "10px",
    circle: "50%"
  },
  glass: {
    default: `
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37);
    `,
    dark: `
      background: rgba(32, 34, 37, 0.7);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37);
    `,
    light: `
      background: rgba(255, 255, 255, 0.2);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.3);
      box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37);
    `,
    accent: `
      background: rgba(114, 137, 218, 0.3);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid rgba(114, 137, 218, 0.4);
      box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37);
    `
  },
  animations: {
    fadeIn: "fadeIn 0.3s ease forwards",
    slideIn: "slideIn 0.3s ease forwards",
    pulse: "pulse 2s infinite",
    glow: "glow 2s infinite"
  }
};
