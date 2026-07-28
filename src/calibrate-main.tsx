import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CalibrationLab } from './components/CalibrationLab';
import { activeLeague } from './data/league-catalog/active';
import './styles.css';
import './lab.css';

document.title = `${activeLeague.competition.name} ∞ · 시장 보정`;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CalibrationLab />
  </StrictMode>,
);
