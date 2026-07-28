import { defineClub } from './club';
import type { CompetitionDefinition, LeagueSystemDefinition } from './types';

const ita = (
  id: string,
  name: string,
  nameKo: string,
  abbr: string,
  color: string,
  secondaryColor: string,
  sourceId?: number,
  parentClubId?: string,
) => defineClub({
  id,
  name,
  nameKo,
  abbr,
  color,
  secondaryColor,
  countryCode: 'ITA',
  sourceId,
  parentClubId,
});

export const italyClubs = [
  // Serie A
  ita('ac-milan', 'AC Milan', 'AC 밀란', 'MIL', '#FB090B', '#000000', 98),
  ita('atalanta', 'Atalanta', '아탈란타', 'ATA', '#1E71B8', '#000000', 102),
  ita('bologna', 'Bologna', '볼로냐', 'BOL', '#1A2F48', '#A71930', 103),
  ita('cagliari', 'Cagliari', '칼리아리', 'CAG', '#1A2F48', '#A71930', 104),
  ita('como', 'Como', '코모', 'COM', '#005BAC', '#FFFFFF', 7397),
  ita('fiorentina', 'Fiorentina', '피오렌티나', 'FIO', '#482E92', '#FFFFFF', 99),
  ita('frosinone', 'Frosinone', '프로시노네', 'FRO', '#F7D117', '#0054A6', 470),
  ita('genoa', 'Genoa', '제노아', 'GEN', '#A71930', '#1A2F48', 107),
  ita('inter', 'Inter', '인테르', 'INT', '#0068A8', '#000000', 108),
  ita('juventus', 'Juventus', '유벤투스', 'JUV', '#FFFFFF', '#000000', 109),
  ita('lazio', 'Lazio', '라치오', 'LAZ', '#87D8F7', '#FFFFFF', 110),
  ita('lecce', 'Lecce', '레체', 'LEC', '#F7D117', '#D71920', 5890),
  ita('monza', 'Monza', '몬차', 'MON', '#E30613', '#FFFFFF', 5911),
  ita('napoli', 'Napoli', '나폴리', 'NAP', '#12A0D7', '#FFFFFF', 113),
  ita('parma', 'Parma', '파르마', 'PAR', '#F7D117', '#0054A6', 112),
  ita('roma', 'Roma', '로마', 'ROM', '#8E1F2F', '#F7A600', 100),
  ita('sassuolo', 'Sassuolo', '사수올로', 'SAS', '#00A651', '#000000', 471),
  ita('torino', 'Torino', '토리노', 'TOR', '#8A1538', '#FFFFFF', 586),
  ita('udinese', 'Udinese', '우디네세', 'UDI', '#FFFFFF', '#000000', 115),
  ita('venezia', 'Venezia', '베네치아', 'VEN', '#F58220', '#008F45', 454),

  // Serie B
  ita('arezzo', 'SS Arezzo', '아레초', 'ARZ', '#8A1538', '#F7D117'),
  ita('ascoli', 'Ascoli', '아스콜리', 'ASC', '#FFFFFF', '#000000'),
  ita('avellino', 'US Avellino 1912', '아벨리노', 'AVE', '#008F45', '#FFFFFF'),
  ita('benevento', 'Benevento', '베네벤토', 'BEN', '#F7D117', '#D71920'),
  ita('carrarese', 'Carrarese', '카라레세', 'CAR', '#58B6E7', '#F7D117'),
  ita('catanzaro', 'Catanzaro', '카탄차로', 'CTZ', '#E30613', '#F7D117'),
  ita('cesena', 'Cesena', '체세나', 'CES', '#FFFFFF', '#000000'),
  ita('cremonese', 'Cremonese', '크레모네세', 'CRE', '#E30613', '#8A8D8F', 457),
  ita('empoli', 'Empoli', '엠폴리', 'EMP', '#0054A6', '#FFFFFF', 445),
  ita('hellas-verona', 'Hellas Verona', '엘라스 베로나', 'VER', '#003D7C', '#F7D117', 450),
  ita('juve-stabia', 'Juve Stabia', '유베 스타비아', 'JST', '#F7D117', '#0054A6'),
  ita('lr-vicenza', 'L.R. Vicenza', 'LR 비첸차', 'VIC', '#E30613', '#FFFFFF'),
  ita('mantova', 'Mantova', '만토바', 'MAN', '#E30613', '#FFFFFF'),
  ita('modena', 'Modena', '모데나', 'MOD', '#F7D117', '#0054A6'),
  ita('padova', 'Padova', '파도바', 'PAD', '#FFFFFF', '#E30613'),
  ita('palermo', 'Palermo', '팔레르모', 'PAL', '#F5A7B8', '#000000'),
  ita('pisa', 'Pisa SC', '피사', 'PIS', '#0054A6', '#000000'),
  ita('sampdoria', 'Sampdoria', '삼프도리아', 'SAM', '#1A75BB', '#FFFFFF', 584),
  ita('sudtirol', 'FC Südtirol', '쥐트티롤', 'SUD', '#FFFFFF', '#E30613'),
  ita('virtus-entella', 'Virtus Entella', '비르투스 엔텔라', 'ENT', '#58B6E7', '#FFFFFF'),

  // Serie C, Group A (provisional at 2026-07-28)
  ita('albinoleffe', 'AlbinoLeffe', '알비노레페', 'ALB', '#58B6E7', '#0054A6'),
  ita('alcione-milano', 'Alcione Milano', '알초네 밀라노', 'ALC', '#F58220', '#0054A6'),
  ita('arzignano', 'Arzignano Valchiampo', '아르치냐노 발키암포', 'ARZ', '#F7D117', '#58B6E7'),
  ita('union-brescia', 'Union Brescia', '우니온 브레시아', 'BRE', '#0054A6', '#FFFFFF'),
  ita('cittadella', 'AS Cittadella', '치타델라', 'CIT', '#8A1538', '#FFFFFF'),
  ita('desenzano', 'Desenzano', '데센차노', 'DES', '#58B6E7', '#0054A6'),
  ita('dolomiti-bellunesi', 'Dolomiti Bellunesi', '돌로미티 벨루네시', 'DOL', '#0054A6', '#F7D117'),
  ita('folgore-caratese', 'Folgore Caratese', '폴고레 카라테세', 'FOL', '#58B6E7', '#FFFFFF'),
  ita('giana-erminio', 'Giana Erminio', '지아나 에르미니오', 'GIA', '#58B6E7', '#FFFFFF'),
  ita('juventus-next-gen', 'Juventus Next Gen', '유벤투스 넥스트 젠', 'JNG', '#FFFFFF', '#000000', undefined, 'juventus'),
  ita('lecco', 'Lecco', '레코', 'LEC', '#0054A6', '#58B6E7'),
  ita('lumezzane', 'FC Lumezzane', '루메차네', 'LUM', '#E30613', '#0054A6'),
  ita('novara', 'Novara', '노바라', 'NOV', '#58B6E7', '#FFFFFF'),
  ita('ospitaletto', 'Ospitaletto', '오스피탈레토', 'OSP', '#F58220', '#0054A6'),
  ita('pergolettese', 'Pergolettese', '페르골레테세', 'PGL', '#F7D117', '#0054A6'),
  ita('pro-vercelli', 'Pro Vercelli', '프로 베르첼리', 'PVC', '#FFFFFF', '#000000'),
  ita('renate', 'Renate', '레나테', 'REN', '#0054A6', '#000000'),
  ita('trento', 'AC Trento 1921', '트렌토', 'TRE', '#F7D117', '#0054A6'),
  ita('treviso', 'Treviso FBC 1993', '트레비소', 'TRV', '#58B6E7', '#FFFFFF'),
  ita('vado', 'Vado', '바도', 'VAD', '#E30613', '#0054A6'),

  // Serie C, Group B
  ita('atalanta-u23', 'Atalanta U23', '아탈란타 U23', 'ATU', '#1E71B8', '#000000', undefined, 'atalanta'),
  ita('campobasso', 'Campobasso', '캄포바소', 'CAM', '#E30613', '#0054A6'),
  ita('carpi', 'Carpi', '카르피', 'CRP', '#FFFFFF', '#E30613'),
  ita('forli', 'Forlì', '포를리', 'FOR', '#FFFFFF', '#E30613'),
  ita('grosseto', 'US Grosseto 1912', '그로세토', 'GRO', '#E30613', '#FFFFFF'),
  ita('gubbio', 'AS Gubbio 1910', '구비오', 'GUB', '#0054A6', '#E30613'),
  ita('guidonia', 'Guidonia Montecelio', '구이도니아 몬테첼리오', 'GUI', '#0054A6', '#E30613'),
  ita('latina', 'Latina Calcio 1932', '라티나', 'LAT', '#FFFFFF', '#000000'),
  ita('livorno', 'US Livorno 1915', '리보르노', 'LIV', '#8A1538', '#FFFFFF'),
  ita('ostiamare', 'Ostiamare', '오스티아마레', 'OST', '#6F2C91', '#FFFFFF'),
  ita('perugia', 'AC Perugia Calcio', '페루자', 'PER', '#E30613', '#FFFFFF'),
  ita('pescara', 'Delfino Pescara 1936', '페스카라', 'PES', '#58B6E7', '#FFFFFF'),
  ita('pianese', 'Pianese', '피아네세', 'PIA', '#FFFFFF', '#000000'),
  ita('pineto', 'Pineto Calcio', '피네토', 'PIN', '#58B6E7', '#FFFFFF'),
  ita('ravenna', 'Ravenna', '라벤나', 'RAV', '#F7D117', '#E30613'),
  ita('reggiana', 'Reggiana', '레자나', 'REG', '#8A1538', '#FFFFFF'),
  ita('sambenedettese', 'Sambenedettese', '삼베네데테세', 'SAM', '#0054A6', '#E30613'),
  ita('spezia', 'Spezia', '스페치아', 'SPE', '#FFFFFF', '#000000'),
  ita('torres', 'Torres', '토레스', 'TOR', '#E30613', '#0054A6'),
  ita('vis-pesaro', 'Vis Pesaro', '비스 페사로', 'VIS', '#E30613', '#FFFFFF'),

  // Serie C, Group C — one place was still open on the verification date.
  ita('team-altamura', 'Team Altamura', '팀 알타무라', 'ALT', '#FFFFFF', '#E30613'),
  ita('audace-cerignola', 'Audace Cerignola', '아우다체 체리뇰라', 'AUD', '#F7D117', '#0054A6'),
  ita('bari', 'Bari', '바리', 'BAR', '#FFFFFF', '#E30613'),
  ita('barletta', 'Barletta', '바를레타', 'BRL', '#E30613', '#FFFFFF'),
  ita('casarano', 'Casarano', '카사라노', 'CSA', '#0054A6', '#E30613'),
  ita('casertana', 'Casertana', '카세르타나', 'CSR', '#E30613', '#0054A6'),
  ita('catania', 'Catania', '카타니아', 'CAT', '#0054A6', '#E30613'),
  ita('cavese', 'Cavese', '카베세', 'CAV', '#58B6E7', '#FFFFFF'),
  ita('cosenza', 'Cosenza', '코센차', 'COS', '#0054A6', '#E30613'),
  ita('crotone', 'Crotone', '크로토네', 'CRO', '#0054A6', '#E30613'),
  ita('foggia', 'Foggia', '포자', 'FOG', '#E30613', '#000000'),
  ita('giugliano', 'Giugliano', '줄리아노', 'GIU', '#0054A6', '#F7D117'),
  ita('inter-u23', 'Inter U23', '인테르 U23', 'INU', '#0068A8', '#000000', undefined, 'inter'),
  ita('monopoli', 'Monopoli', '모노폴리', 'MNP', '#008F45', '#FFFFFF'),
  ita('picerno', 'AZ Picerno', 'AZ 피체르노', 'PIC', '#E30613', '#0054A6'),
  ita('potenza', 'Potenza', '포텐차', 'POT', '#E30613', '#0054A6'),
  ita('salernitana', 'Salernitana', '살레르니타나', 'SAL', '#8A1538', '#FFFFFF'),
  ita('savoia', 'Savoia', '사보이아', 'SAV', '#FFFFFF', '#0054A6'),
  ita('scafatese', 'Scafatese', '스카파테세', 'SCA', '#F7D117', '#0054A6'),
  ita('sorrento', 'Sorrento', '소렌토', 'SOR', '#E30613', '#000000'),
] as const;

export const serieAClubIds = [
  'ac-milan', 'atalanta', 'bologna', 'cagliari', 'como', 'fiorentina',
  'frosinone', 'genoa', 'inter', 'juventus', 'lazio', 'lecce', 'monza',
  'napoli', 'parma', 'roma', 'sassuolo', 'torino', 'udinese', 'venezia',
] as const;

const serieBClubIds = [
  'arezzo', 'ascoli', 'avellino', 'benevento', 'carrarese', 'catanzaro',
  'cesena', 'cremonese', 'empoli', 'hellas-verona', 'juve-stabia',
  'lr-vicenza', 'mantova', 'modena', 'padova', 'palermo', 'pisa',
  'sampdoria', 'sudtirol', 'virtus-entella',
] as const;

const serieCGroups = {
  A: [
    'albinoleffe', 'alcione-milano', 'arzignano', 'union-brescia',
    'cittadella', 'desenzano', 'dolomiti-bellunesi', 'folgore-caratese',
    'giana-erminio', 'juventus-next-gen', 'lecco', 'lumezzane', 'novara',
    'ospitaletto', 'pergolettese', 'pro-vercelli', 'renate', 'trento',
    'treviso', 'vado',
  ],
  B: [
    'atalanta-u23', 'campobasso', 'carpi', 'forli', 'grosseto', 'gubbio',
    'guidonia', 'latina', 'livorno', 'ostiamare', 'perugia', 'pescara',
    'pianese', 'pineto', 'ravenna', 'reggiana', 'sambenedettese', 'spezia',
    'torres', 'vis-pesaro',
  ],
  C: [
    'team-altamura', 'audace-cerignola', 'bari', 'barletta', 'casarano',
    'casertana', 'catania', 'cavese', 'cosenza', 'crotone', 'foggia',
    'giugliano', 'inter-u23', 'monopoli', 'picerno', 'potenza',
    'salernitana', 'savoia', 'scafatese', 'sorrento',
  ],
} as const;

const standardPoints = { win: 3, draw: 1, loss: 0 } as const;
const tableTieBreakers = [
  'headToHeadPoints',
  'headToHeadGoalDifference',
  'goalDifference',
  'goalsFor',
] as const;
const season = (sourceUrl: string) => ({
  id: '2026-27',
  startYear: 2026,
  verifiedAt: '2026-07-28',
  sourceUrl,
});

export const serieA2026: CompetitionDefinition = {
  id: 'ita-serie-a',
  countryCode: 'ITA',
  name: 'Serie A',
  nameKo: '세리에 A',
  tier: 1,
  professional: true,
  season: season('https://en.legaseriea.it/serie-a/news/looking-forward-to-the-2026-27-serie-a-fixture-list'),
  expectedClubCount: 20,
  rosterStatus: 'verified',
  clubIds: serieAClubIds,
  legs: 2,
  points: standardPoints,
  tieBreakers: tableTieBreakers,
  rulesSources: [
    {
      label: 'FIGC 2026/27 Serie A table and decisive playoff rules',
      url: 'https://files.figc.it/version/c%3AZmUzYzk0MzUtMzU0Zi00%3AYTk3YzZiZGEtYmExYi00/244%20-%20Deroga%20art.%2051%20NOIF%20-%20Determinazione%20classifica%20Campionato%20Serie%20A%20ss%202026%20-%202027.pdf',
      verifiedAt: '2026-07-28',
    },
  ],
  decisivePlayoffs: [
    {
      positions: [1, 2],
      purpose: 'title',
      format: 'single-match',
      trigger: 'points-tied',
      note: '1위와 2위가 동점이면 우승 결정 단판 경기를 치른다.',
    },
    {
      positions: [17, 18],
      purpose: 'relegation',
      format: 'two-legged',
      trigger: 'points-tied',
      note: '17위와 18위가 동점이면 홈 앤드 어웨이 잔류 결정전을 치른다.',
    },
  ],
  relegation: {
    automatic: { positions: [19, 20], places: 2, destinationCompetitionId: 'ita-serie-b' },
    conditionalPlayoff: {
      positions: [17, 18],
      places: 1,
      destinationCompetitionId: 'ita-serie-b',
      note: '승점 동률이면 결정전 패자, 동률이 아니면 18위가 강등된다.',
    },
  },
};

export const serieB2026: CompetitionDefinition = {
  id: 'ita-serie-b',
  countryCode: 'ITA',
  name: 'Serie BKT',
  nameKo: '세리에 B',
  tier: 2,
  professional: true,
  season: season('https://www.legab.it/seriebkt/squadre'),
  expectedClubCount: 20,
  rosterStatus: 'verified',
  clubIds: serieBClubIds,
  legs: 2,
  points: standardPoints,
  tieBreakers: tableTieBreakers,
  promotion: {
    automatic: { positions: [1, 2], places: 2, destinationCompetitionId: 'ita-serie-a' },
    playoff: {
      positions: [3, 4, 5, 6, 7, 8],
      places: 1,
      destinationCompetitionId: 'ita-serie-a',
      note: '승점 차에 따라 플레이오프 참가 범위가 축소될 수 있음.',
    },
  },
  relegation: {
    automatic: { positions: [18, 19, 20], places: 3, destinationCompetitionId: 'ita-serie-c' },
    conditionalPlayoff: {
      positions: [16, 17],
      places: 1,
      destinationCompetitionId: 'ita-serie-c',
      note: '16·17위 승점 차가 기준을 넘으면 17위가 바로 강등, 아니면 플레이아웃 패자가 강등.',
    },
  },
};

export const serieC2026: CompetitionDefinition = {
  id: 'ita-serie-c',
  countryCode: 'ITA',
  name: 'Serie C',
  nameKo: '세리에 C',
  tier: 3,
  professional: true,
  season: season('https://www.seriec.com/news-detail/date-calendario-stagione-2627'),
  expectedClubCount: 60,
  rosterStatus: 'provisional',
  groups: serieCGroups,
  clubIds: [...serieCGroups.A, ...serieCGroups.B, ...serieCGroups.C],
  openSlots: 0,
  legs: 2,
  points: standardPoints,
  tieBreakers: tableTieBreakers,
  promotion: {
    automatic: {
      positions: [1],
      places: 1,
      scope: 'per-group',
      destinationCompetitionId: 'ita-serie-b',
    },
    playoff: {
      positions: [2, 3, 4, 5, 6, 7, 8, 9, 10],
      places: 1,
      scope: 'competition',
      destinationCompetitionId: 'ita-serie-b',
      note: '세 그룹 통합 전국 플레이오프 우승 구단 1팀.',
    },
  },
  relegation: {
    automatic: {
      positions: [20],
      places: 1,
      scope: 'per-group',
      externalBoundary: true,
    },
    conditionalPlayoff: {
      positions: [16, 17, 18, 19],
      places: 2,
      scope: 'per-group',
      externalBoundary: true,
      note: '그룹별 플레이아웃 결과에 따라 세리에 D로 두 팀 추가 강등.',
    },
  },
  notes: [
    '2026-07-28 기준 세 그룹 명단은 보도된 잠정 편성이다.',
    'Lega Pro의 공식 시즌 문서가 발표되면 rosterStatus와 그룹 구성을 다시 검증해야 한다.',
    'U23 팀은 모구단과 같은 디비전에 참가할 수 없는 제약을 승격 검증에 적용해야 한다.',
  ],
};

export const italyLeagueSystem: LeagueSystemDefinition = {
  id: 'italy-mens',
  countryCode: 'ITA',
  name: 'Italian men’s league system',
  nameKo: '이탈리아 남자 리그 시스템',
  professionalTierRange: [1, 3],
  competitions: [serieA2026, serieB2026, serieC2026],
  sources: [
    {
      label: 'FIGC professional league registration and replacement criteria',
      url: 'https://www.figc.it/en/figc/news/criteria-approved-for-readmissions-replacements-and-repechage-in-professional-leagues-a6445k6a',
      verifiedAt: '2026-07-28',
    },
  ],
  notes: [
    'FIGC가 2026/27 등록·대체 기준에서 Serie A, B, C를 프로 대회로 다룬다.',
    'Serie D는 LND가 관할하는 외부 승강 경계로 둔다.',
  ],
};
