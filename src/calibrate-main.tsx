import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CalibrationLab } from './components/CalibrationLab';
import './styles.css';
import './lab.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CalibrationLab />
  </StrictMode>,
);
