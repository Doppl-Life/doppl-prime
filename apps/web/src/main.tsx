import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import { App } from './App';

// Production entry point — mounts the dashboard shell into #root (index.html). The data client
// (runClient/sseStream) is consumed by P7.2's run store and thereafter every panel; real HTTP/SSE
// wiring to the P6 backend endpoints happens at integration.
const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
