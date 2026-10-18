import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// polices hébergées avec le site (plus de requête vers Google, et elles restent en cache) ; seule la partie latine est téléchargée pour du texte français
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/cinzel';
import './index.css';
import './store/sessionCleanup';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
