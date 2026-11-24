import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// polices hébergées avec le site (plus de requête vers Google, et elles restent en cache) ; seule la partie latine est téléchargée pour du texte français
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/cinzel';
// polices des ambiances Cinéma / Terminal / Papier : le navigateur ne les télécharge que si une ambiance les utilise
import '@fontsource-variable/playfair-display/wght.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import '@fontsource-variable/fraunces/wght.css';
import './index.css';
import './skin5.css';
import './skin-light.css';
import './skin-light-fixes.css';
import './ambiances.css';
import './app.css';
import './store/sessionCleanup';
import { watchSystemMode } from './lib/theme';

watchSystemMode(); // « Auto » : suit le système en direct

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
