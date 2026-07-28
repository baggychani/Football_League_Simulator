import { defineClub } from './club';
import type { CompetitionDefinition, LeagueSystemDefinition, MarketProviderDefinition } from './types';

const eng = (
  id: string,
  name: string,
  nameKo: string,
  abbr: string,
  color: string,
  secondaryColor: string,
  sourceId?: number,
  structuralTier?: number,
) => defineClub({
  id,
  name,
  nameKo,
  abbr,
  color,
  secondaryColor,
  countryCode: 'ENG',
  sourceId,
  structuralTier,
});

/**
 * 2026/27 English professional pyramid club identities.
 *
 * IDs deliberately omit the division: a club keeps the same identity when it
 * moves between tiers. Division membership lives only in competition rosters.
 */
export const englandClubs = [
  // Premier League
  eng('arsenal', 'Arsenal', '아스널', 'ARS', '#EF0107', '#FFFFFF', 57, 1),
  eng('aston-villa', 'Aston Villa', '애스턴 빌라', 'AVL', '#670E36', '#95BFE5', 58, .35),
  eng('bournemouth', 'Bournemouth', '본머스', 'BOU', '#B50E12', '#000000', 1044),
  eng('brentford', 'Brentford', '브렌트퍼드', 'BRE', '#E30613', '#FFFFFF', 402),
  eng('brighton', 'Brighton & Hove Albion', '브라이턴', 'BHA', '#0057B8', '#FFFFFF', 397),
  eng('chelsea', 'Chelsea', '첼시', 'CHE', '#034694', '#FFFFFF', 61, 1),
  eng('coventry', 'Coventry City', '코번트리', 'COV', '#0BA3C8', '#FFFFFF', 1076),
  eng('crystal-palace', 'Crystal Palace', '크리스털 팰리스', 'CRY', '#1B458F', '#C4122E', 354),
  eng('everton', 'Everton', '에버턴', 'EVE', '#003399', '#FFFFFF', 62),
  eng('fulham', 'Fulham', '풀럼', 'FUL', '#FFFFFF', '#000000', 63),
  eng('hull', 'Hull City', '헐 시티', 'HUL', '#F5A122', '#000000', 322),
  eng('ipswich', 'Ipswich Town', '입스위치', 'IPS', '#001A57', '#FFFFFF', 349),
  eng('leeds', 'Leeds United', '리즈 유나이티드', 'LEE', '#FFFFFF', '#1D428A', 341),
  eng('liverpool', 'Liverpool', '리버풀', 'LIV', '#C8102E', '#FFFFFF', 64, 1),
  eng('man-city', 'Manchester City', '맨시티', 'MCI', '#6CABDD', '#FFFFFF', 65, 1),
  eng('man-united', 'Manchester United', '맨유', 'MUN', '#DA291C', '#FFFFFF', 66, 1),
  eng('newcastle', 'Newcastle United', '뉴캐슬', 'NEW', '#000000', '#FFFFFF', 67, .35),
  eng('nottingham-forest', 'Nottingham Forest', '노팅엄 포레스트', 'NFO', '#E53233', '#FFFFFF', 351),
  eng('sunderland', 'Sunderland', '선덜랜드', 'SUN', '#EB172B', '#FFFFFF', 71),
  eng('tottenham', 'Tottenham Hotspur', '토트넘', 'TOT', '#FFFFFF', '#132257', 73, .35),

  // Championship
  eng('birmingham', 'Birmingham City', '버밍엄 시티', 'BIR', '#0000FF', '#FFFFFF', 332),
  eng('blackburn', 'Blackburn Rovers', '블랙번 로버스', 'BLB', '#0053A0', '#FFFFFF', 59),
  eng('bolton', 'Bolton Wanderers', '볼턴 원더러스', 'BOL', '#FFFFFF', '#002B5C', 60),
  eng('bristol-city', 'Bristol City', '브리스틀 시티', 'BRC', '#E21A23', '#FFFFFF', 387),
  eng('burnley', 'Burnley', '번리', 'BUR', '#6C1D45', '#99D6EA', 328),
  eng('cardiff', 'Cardiff City', '카디프 시티', 'CAR', '#0070B5', '#FFFFFF', 715),
  eng('charlton', 'Charlton Athletic', '찰턴 애슬레틱', 'CHA', '#D71920', '#FFFFFF', 348),
  eng('derby', 'Derby County', '더비 카운티', 'DER', '#FFFFFF', '#000000', 342),
  eng('lincoln', 'Lincoln City', '링컨 시티', 'LIN', '#E30613', '#FFFFFF'),
  eng('middlesbrough', 'Middlesbrough', '미들즈브러', 'MID', '#E11B22', '#FFFFFF', 343),
  eng('millwall', 'Millwall', '밀월', 'MIL', '#001D5A', '#FFFFFF', 384),
  eng('norwich', 'Norwich City', '노리치 시티', 'NOR', '#FFF200', '#00A650', 68),
  eng('portsmouth', 'Portsmouth', '포츠머스', 'POR', '#001489', '#FFFFFF', 325),
  eng('preston', 'Preston North End', '프레스턴 노스 엔드', 'PNE', '#FFFFFF', '#001F5B', 1081),
  eng('qpr', 'Queens Park Rangers', '퀸스 파크 레인저스', 'QPR', '#005CAB', '#FFFFFF', 69),
  eng('sheffield-united', 'Sheffield United', '셰필드 유나이티드', 'SHU', '#EE2737', '#FFFFFF', 356),
  eng('southampton', 'Southampton', '사우샘프턴', 'SOU', '#D71920', '#FFFFFF', 340),
  eng('stoke', 'Stoke City', '스토크 시티', 'STK', '#E03A3E', '#FFFFFF', 70),
  eng('swansea', 'Swansea City', '스완지 시티', 'SWA', '#FFFFFF', '#000000', 72),
  eng('watford', 'Watford', '왓퍼드', 'WAT', '#FBEE23', '#ED2127', 346),
  eng('west-brom', 'West Bromwich Albion', '웨스트 브로미치 앨비언', 'WBA', '#122F67', '#FFFFFF', 74),
  eng('west-ham', 'West Ham United', '웨스트햄 유나이티드', 'WHU', '#7A263A', '#1BB1E7', 563),
  eng('wolves', 'Wolverhampton Wanderers', '울버햄프턴 원더러스', 'WOL', '#FDB913', '#231F20', 76),
  eng('wrexham', 'Wrexham', '렉섬', 'WRE', '#E21B23', '#FFFFFF'),

  // League One
  eng('afc-wimbledon', 'AFC Wimbledon', 'AFC 윔블던', 'WIM', '#00529B', '#F7D417'),
  eng('barnsley', 'Barnsley', '반즐리', 'BAR', '#E31B23', '#FFFFFF'),
  eng('blackpool', 'Blackpool', '블랙풀', 'BLP', '#F58220', '#FFFFFF'),
  eng('bradford-city', 'Bradford City', '브래드퍼드 시티', 'BRA', '#6A002C', '#F5A800'),
  eng('bromley', 'Bromley', '브롬리', 'BRO', '#FFFFFF', '#000000'),
  eng('burton', 'Burton Albion', '버턴 앨비언', 'BRT', '#F7D117', '#000000'),
  eng('cambridge-united', 'Cambridge United', '케임브리지 유나이티드', 'CAM', '#FFCC00', '#000000'),
  eng('doncaster', 'Doncaster Rovers', '동커스터 로버스', 'DON', '#E30613', '#FFFFFF'),
  eng('huddersfield', 'Huddersfield Town', '허더즈필드 타운', 'HUD', '#0072CE', '#FFFFFF'),
  eng('leicester', 'Leicester City', '레스터 시티', 'LEI', '#003090', '#FDBE11', 338),
  eng('leyton-orient', 'Leyton Orient', '레이턴 오리엔트', 'LEY', '#E21B23', '#FFFFFF'),
  eng('luton', 'Luton Town', '루턴 타운', 'LUT', '#F78F1E', '#002D62'),
  eng('mansfield', 'Mansfield Town', '맨스필드 타운', 'MAN', '#F3D327', '#0B2B5B'),
  eng('mk-dons', 'Milton Keynes Dons', '밀턴킨스 던스', 'MKD', '#FFFFFF', '#C8102E'),
  eng('notts-county', 'Notts County', '노츠 카운티', 'NOT', '#000000', '#FFFFFF'),
  eng('oxford-united', 'Oxford United', '옥스퍼드 유나이티드', 'OXF', '#F9E000', '#002147'),
  eng('peterborough', 'Peterborough United', '피터버러 유나이티드', 'PET', '#004B8D', '#FFFFFF'),
  eng('plymouth', 'Plymouth Argyle', '플리머스 아가일', 'PLY', '#00563F', '#FFFFFF'),
  eng('reading', 'Reading', '레딩', 'REA', '#004494', '#FFFFFF'),
  eng('sheffield-wednesday', 'Sheffield Wednesday', '셰필드 웬즈데이', 'SHW', '#0067B1', '#FFFFFF'),
  eng('stockport', 'Stockport County', '스톡포트 카운티', 'STO', '#0054A6', '#FFFFFF'),
  eng('stevenage', 'Stevenage', '스티버니지', 'STE', '#E31B23', '#FFFFFF'),
  eng('wigan', 'Wigan Athletic', '위건 애슬레틱', 'WIG', '#0053A0', '#FFFFFF'),
  eng('wycombe', 'Wycombe Wanderers', '위컴 원더러스', 'WYC', '#003B7A', '#5BB8E8'),

  // League Two
  eng('accrington', 'Accrington Stanley', '애크링턴 스탠리', 'ACC', '#D71920', '#FFFFFF'),
  eng('barnet', 'Barnet', '바닛', 'BNT', '#F58220', '#000000'),
  eng('bristol-rovers', 'Bristol Rovers', '브리스틀 로버스', 'BRR', '#0054A6', '#FFFFFF'),
  eng('cheltenham', 'Cheltenham Town', '첼트넘 타운', 'CLT', '#E31B23', '#FFFFFF'),
  eng('chesterfield', 'Chesterfield', '체스터필드', 'CHF', '#0054A6', '#FFFFFF'),
  eng('colchester', 'Colchester United', '콜체스터 유나이티드', 'COL', '#004B8D', '#FFFFFF'),
  eng('crawley', 'Crawley Town', '크롤리 타운', 'CRA', '#D71920', '#FFFFFF'),
  eng('crewe', 'Crewe Alexandra', '크루 알렉산드라', 'CRE', '#E31B23', '#FFFFFF'),
  eng('exeter', 'Exeter City', '엑서터 시티', 'EXE', '#E30613', '#FFFFFF'),
  eng('fleetwood', 'Fleetwood Town', '플리트우드 타운', 'FLE', '#E31B23', '#FFFFFF'),
  eng('gillingham', 'Gillingham', '질링엄', 'GIL', '#0054A6', '#FFFFFF'),
  eng('grimsby', 'Grimsby Town', '그림즈비 타운', 'GRI', '#000000', '#FFFFFF'),
  eng('newport', 'Newport County', '뉴포트 카운티', 'NPT', '#F5A800', '#000000'),
  eng('northampton', 'Northampton Town', '노샘프턴 타운', 'NHA', '#7A263A', '#FFFFFF'),
  eng('oldham', 'Oldham Athletic', '올덤 애슬레틱', 'OLD', '#0054A6', '#FFFFFF'),
  eng('port-vale', 'Port Vale', '포트 베일', 'PVA', '#FFFFFF', '#000000'),
  eng('rochdale', 'Rochdale AFC', '로치데일', 'ROC', '#0054A6', '#FFFFFF'),
  eng('rotherham', 'Rotherham United', '로더럼 유나이티드', 'ROT', '#E31B23', '#FFFFFF'),
  eng('salford', 'Salford City', '솔퍼드 시티', 'SAL', '#E31B23', '#FFFFFF'),
  eng('shrewsbury', 'Shrewsbury Town', '슈루즈베리 타운', 'SHR', '#0054A6', '#F5A800'),
  eng('swindon', 'Swindon Town', '스윈던 타운', 'SWI', '#E31B23', '#FFFFFF'),
  eng('tranmere', 'Tranmere Rovers', '트랜미어 로버스', 'TRA', '#FFFFFF', '#0054A6'),
  eng('walsall', 'Walsall', '월솔', 'WAL', '#E31B23', '#FFFFFF'),
  eng('york', 'York City', '요크 시티', 'YOR', '#E31B23', '#FFFFFF'),
] as const;

export const premierLeagueClubIds = [
  'arsenal', 'aston-villa', 'bournemouth', 'brentford', 'brighton',
  'chelsea', 'coventry', 'crystal-palace', 'everton', 'fulham',
  'hull', 'ipswich', 'leeds', 'liverpool', 'man-city', 'man-united',
  'newcastle', 'nottingham-forest', 'sunderland', 'tottenham',
] as const;

const championshipClubIds = [
  'birmingham', 'blackburn', 'bolton', 'bristol-city', 'burnley', 'cardiff',
  'charlton', 'derby', 'lincoln', 'middlesbrough', 'millwall', 'norwich',
  'portsmouth', 'preston', 'qpr', 'sheffield-united', 'southampton', 'stoke',
  'swansea', 'watford', 'west-brom', 'west-ham', 'wolves', 'wrexham',
] as const;

const leagueOneClubIds = [
  'afc-wimbledon', 'barnsley', 'blackpool', 'bradford-city', 'bromley',
  'burton', 'cambridge-united', 'doncaster', 'huddersfield', 'leicester',
  'leyton-orient', 'luton', 'mansfield', 'mk-dons', 'notts-county',
  'oxford-united', 'peterborough', 'plymouth', 'reading', 'sheffield-wednesday',
  'stockport', 'stevenage', 'wigan', 'wycombe',
] as const;

const leagueTwoClubIds = [
  'accrington', 'barnet', 'bristol-rovers', 'cheltenham', 'chesterfield',
  'colchester', 'crawley', 'crewe', 'exeter', 'fleetwood', 'gillingham',
  'grimsby', 'newport', 'northampton', 'oldham', 'port-vale', 'rochdale',
  'rotherham', 'salford', 'shrewsbury', 'swindon', 'tranmere', 'walsall', 'york',
] as const;

const standardPoints = { win: 3, draw: 1, loss: 0 } as const;
const tableTieBreakers = [
  'goalDifference',
  'goalsFor',
  'headToHeadPoints',
  'headToHeadAwayGoals',
] as const;
const season = (sourceUrl: string) => ({
  id: '2026-27',
  startYear: 2026,
  verifiedAt: '2026-07-28',
  sourceUrl,
});

export const premierLeague2026: CompetitionDefinition = {
  id: 'eng-premier-league',
  countryCode: 'ENG',
  name: 'Premier League',
  nameKo: '프리미어리그',
  tier: 1,
  professional: true,
  season: season('https://www.premierleague.com/en/news/4673099/the-202627-premier-league-season-officially-starts/'),
  expectedClubCount: 20,
  rosterStatus: 'verified',
  clubIds: premierLeagueClubIds,
  legs: 2,
  points: standardPoints,
  tieBreakers: tableTieBreakers,
  rulesSources: [
    {
      label: 'Premier League final-table tie-break and neutral playoff rules',
      url: 'https://www.premierleague.com/en/news/4638196/could-the-premier-league-title-be-won-on-goal-difference',
      verifiedAt: '2026-07-28',
    },
  ],
  decisivePlayoffs: [
    {
      positions: [1, 2],
      purpose: 'title',
      format: 'single-match',
      trigger: 'all-tiebreakers-tied',
    },
    {
      positions: [5, 6],
      purpose: 'qualification',
      format: 'single-match',
      trigger: 'all-tiebreakers-tied',
    },
    {
      positions: [6, 7],
      purpose: 'qualification',
      format: 'single-match',
      trigger: 'all-tiebreakers-tied',
    },
    {
      positions: [17, 18],
      purpose: 'relegation',
      format: 'single-match',
      trigger: 'all-tiebreakers-tied',
    },
  ],
  qualification: {
    championPosition: 1,
    championsLeaguePositions: [1, 2, 3, 4, 5],
    europaLeaguePositions: [6],
  },
  relegation: {
    automatic: {
      positions: [18, 19, 20],
      places: 3,
      destinationCompetitionId: 'eng-championship',
    },
  },
};

export const championship2026: CompetitionDefinition = {
  id: 'eng-championship',
  countryCode: 'ENG',
  name: 'EFL Championship',
  nameKo: 'EFL 챔피언십',
  tier: 2,
  professional: true,
  season: season('https://en.wikipedia.org/wiki/2026%E2%80%9327_EFL_Championship'),
  expectedClubCount: 24,
  rosterStatus: 'verified',
  clubIds: championshipClubIds,
  legs: 2,
  points: standardPoints,
  tieBreakers: tableTieBreakers,
  rulesSources: [
    {
      label: 'EFL 2026/27 Championship playoff format',
      url: 'https://www.efl.com/news/2026/march/05/efl-statement--sky-bet-championship-play-off-format/',
      verifiedAt: '2026-07-28',
    },
  ],
  promotion: {
    automatic: { positions: [1, 2], places: 2, destinationCompetitionId: 'eng-premier-league' },
    playoff: {
      positions: [3, 4, 5, 6, 7, 8],
      places: 1,
      destinationCompetitionId: 'eng-premier-league',
      note: '2026/27부터 3~8위 6개 구단, 총 7경기 방식.',
    },
  },
  relegation: {
    automatic: { positions: [22, 23, 24], places: 3, destinationCompetitionId: 'eng-league-one' },
  },
};

export const leagueOne2026: CompetitionDefinition = {
  id: 'eng-league-one',
  countryCode: 'ENG',
  name: 'EFL League One',
  nameKo: 'EFL 리그 원',
  tier: 3,
  professional: true,
  season: season('https://en.wikipedia.org/wiki/2026%E2%80%9327_EFL_League_One'),
  expectedClubCount: 24,
  rosterStatus: 'verified',
  clubIds: leagueOneClubIds,
  legs: 2,
  points: standardPoints,
  tieBreakers: tableTieBreakers,
  promotion: {
    automatic: { positions: [1, 2], places: 2, destinationCompetitionId: 'eng-championship' },
    playoff: { positions: [3, 4, 5, 6], places: 1, destinationCompetitionId: 'eng-championship' },
  },
  relegation: {
    automatic: { positions: [21, 22, 23, 24], places: 4, destinationCompetitionId: 'eng-league-two' },
  },
};

export const leagueTwo2026: CompetitionDefinition = {
  id: 'eng-league-two',
  countryCode: 'ENG',
  name: 'EFL League Two',
  nameKo: 'EFL 리그 투',
  tier: 4,
  professional: true,
  season: season('https://en.wikipedia.org/wiki/2026%E2%80%9327_EFL_League_Two'),
  expectedClubCount: 24,
  rosterStatus: 'verified',
  clubIds: leagueTwoClubIds,
  legs: 2,
  points: standardPoints,
  tieBreakers: tableTieBreakers,
  promotion: {
    automatic: { positions: [1, 2, 3], places: 3, destinationCompetitionId: 'eng-league-one' },
    playoff: { positions: [4, 5, 6, 7], places: 1, destinationCompetitionId: 'eng-league-one' },
  },
  relegation: {
    automatic: {
      positions: [23, 24],
      places: 2,
      externalBoundary: true,
      note: '내셔널리그(5부)로 강등. 현재 시뮬레이션 경계 밖의 교환 슬롯.',
    },
  },
};

export const englandLeagueSystem: LeagueSystemDefinition = {
  id: 'england-mens',
  countryCode: 'ENG',
  name: 'English men’s league system',
  nameKo: '잉글랜드 남자 리그 시스템',
  professionalTierRange: [1, 4],
  competitions: [premierLeague2026, championship2026, leagueOne2026, leagueTwo2026],
  sources: [
    {
      label: 'EFL handbook and 72-club divisional structure',
      url: 'https://www.efl.com/documents/efl-handbook.pdf',
      verifiedAt: '2026-07-28',
    },
    {
      label: 'EFL 2026/27 fixture release',
      url: 'https://www.efl.com/news/2026/june/25/the-2026-27-efl-fixtures-are-here/',
      verifiedAt: '2026-07-28',
    },
  ],
  notes: [
    '프리미어리그와 EFL의 3개 디비전까지를 상시 프로 시뮬레이션 범위로 둔다.',
    '리그 투 아래 내셔널리그는 승강 교환 경계로 모델링하며 별도 데이터 팩을 추가할 수 있다.',
  ],
};

export const premierLeaguePolymarket: MarketProviderDefinition = {
  provider: 'polymarket',
  eventSlug: 'epl-2027-champion-20260701200428749',
  teamTitleToClubId: {
    Arsenal: 'arsenal',
    'Aston Villa': 'aston-villa',
    Bournemouth: 'bournemouth',
    Brentford: 'brentford',
    Brighton: 'brighton',
    Chelsea: 'chelsea',
    Coventry: 'coventry',
    'Coventry City': 'coventry',
    'Crystal Palace': 'crystal-palace',
    Everton: 'everton',
    Fulham: 'fulham',
    Hull: 'hull',
    'Hull City': 'hull',
    Ipswich: 'ipswich',
    'Ipswich Town': 'ipswich',
    Leeds: 'leeds',
    'Leeds United': 'leeds',
    Liverpool: 'liverpool',
    'Manchester City': 'man-city',
    'Manchester United': 'man-united',
    Newcastle: 'newcastle',
    'Newcastle United': 'newcastle',
    'Nottingham Forest': 'nottingham-forest',
    Sunderland: 'sunderland',
    Tottenham: 'tottenham',
    'Tottenham Hotspur': 'tottenham',
  },
};
