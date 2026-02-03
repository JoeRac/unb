import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';

import './index.css';

// Force LTR direction globally to prevent backwards text in contentEditable
document.documentElement.setAttribute('dir', 'ltr');
document.body.setAttribute('dir', 'ltr');
document.body.style.direction = 'ltr';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
