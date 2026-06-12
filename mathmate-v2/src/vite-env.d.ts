/// <reference types="vite/client" />

// Shared global CSS class names used by CSS-module components
declare module "../styles/components.css" {
  const classes: {
    "btn-icon": string;
    "btn-icon-danger": string;
    "btn-primary": string;
    "list-row": string;
    "tooltip": string;
    "menu-item": string;
    danger: string;
  };
  export default classes;
  export = classes;
}
