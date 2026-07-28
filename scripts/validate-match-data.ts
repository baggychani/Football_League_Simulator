import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { leagueSystems } from '../src/data/league-catalog/catalog';
import {
  assertMatchDataSnapshotValid,
} from '../src/data/football-data/validation';

const input = process.argv[2];
if (!input) {
  throw new Error('Usage: npm run matches:validate -- <snapshot.json>');
}

const path = resolve(input);
const value: unknown = JSON.parse(await readFile(path, 'utf8'));
if (!value || typeof value !== 'object' || Array.isArray(value)) {
  throw new Error('Match-data snapshot must be an object.');
}
const competitionId = (value as { competitionId?: unknown }).competitionId;
if (typeof competitionId !== 'string') {
  throw new Error('Match-data snapshot is missing competitionId.');
}
const competition = leagueSystems
  .flatMap(system => system.competitions)
  .find(candidate => candidate.id === competitionId);
if (!competition) {
  throw new Error(`Unknown competitionId: ${competitionId}`);
}

assertMatchDataSnapshotValid(value, competition);
console.log(
  `${path}: valid ${competition.id} ${competition.season.id} match-data snapshot`,
);
