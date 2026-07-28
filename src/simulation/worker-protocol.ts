import type {
  ChampionHistoryPage,
  LeagueRow,
  RecordCategory,
  RecordPage,
  SeasonArchivePage,
  SimulationSnapshot,
} from '../domain/types';

export type SimulationWorkerRequest =
  | {
      type: 'start';
      selected: string;
      seed: number;
      speed: number;
      ratings: Readonly<Record<string, number>>;
    }
  | { type: 'selected'; selected: string }
  | { type: 'speed'; speed: number }
  | { type: 'pause' | 'resume' | 'continue' | 'reset' }
  | {
      type: 'getRecordPage';
      category: RecordCategory;
      offset?: number;
      limit?: number;
    }
  | {
      type: 'getSeasonArchivePage' | 'getChampionHistoryPage';
      offset?: number;
      limit?: number;
    };

export type SimulationWorkerResponse =
  | {
      type: 'snapshot' | 'reset';
      snapshot: SimulationSnapshot;
      /** Monotonic display timeline position; zero is the blank initial table. */
      displayFrame: number;
    }
  | {
      type: 'champion';
      displayFrame: number;
      selectedId: string;
      snapshot: SimulationSnapshot;
      champion: LeagueRow & { margin: number; seed: number };
    }
  | { type: 'recordPage'; result: RecordPage }
  | { type: 'seasonArchivePage'; result: SeasonArchivePage }
  | { type: 'championHistoryPage'; result: ChampionHistoryPage };
