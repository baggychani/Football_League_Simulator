import { defineClub } from './club';
import type { CompetitionDefinition, LeagueSystemDefinition } from './types';

const esp = (
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
  countryCode: 'ESP',
  sourceId,
  parentClubId,
});

/**
 * Spain's two professional divisions plus the 2026/27 Primera Federación
 * feeder roster. Reserve sides have their own stable IDs but promotion rules
 * can later reject promotion when their senior side occupies the destination.
 */
export const spainClubs = [
  // LALIGA EA SPORTS
  esp('athletic-club', 'Athletic Club', '아틀레틱 클루브', 'ATH', '#EE2523', '#FFFFFF', 77),
  esp('atletico-madrid', 'Atlético de Madrid', '아틀레티코 마드리드', 'ATM', '#CB3524', '#FFFFFF', 78),
  esp('osasuna', 'CA Osasuna', '오사수나', 'OSA', '#D91A21', '#0A346F', 79),
  esp('celta', 'RC Celta', '셀타 비고', 'CEL', '#8AC3EE', '#A71930', 558),
  esp('alaves', 'Deportivo Alavés', '데포르티보 알라베스', 'ALA', '#0055A4', '#FFFFFF', 263),
  esp('elche', 'Elche CF', '엘체', 'ELC', '#007D4A', '#FFFFFF', 285),
  esp('barcelona', 'FC Barcelona', '바르셀로나', 'FCB', '#004D98', '#A50044', 81),
  esp('getafe', 'Getafe CF', '헤타페', 'GET', '#005999', '#FFFFFF', 82),
  esp('levante', 'Levante UD', '레반테', 'LEV', '#005CA9', '#B31B34', 88),
  esp('malaga', 'Málaga CF', '말라가', 'MAL', '#009FE3', '#FFFFFF', 84),
  esp('racing-santander', 'Racing de Santander', '라싱 산탄데르', 'RAC', '#008F45', '#FFFFFF'),
  esp('rayo-vallecano', 'Rayo Vallecano', '라요 바예카노', 'RAY', '#FFFFFF', '#E30613', 87),
  esp('deportivo', 'RC Deportivo', '데포르티보 라코루냐', 'DEP', '#005CA9', '#FFFFFF', 560),
  esp('espanyol', 'RCD Espanyol', '에스파뇰', 'ESP', '#007FC8', '#FFFFFF', 80),
  esp('real-betis', 'Real Betis', '레알 베티스', 'BET', '#00954C', '#FFFFFF', 90),
  esp('real-madrid', 'Real Madrid', '레알 마드리드', 'RMA', '#FFFFFF', '#FEBE10', 86),
  esp('real-sociedad', 'Real Sociedad', '레알 소시에다드', 'RSO', '#0067B1', '#FFFFFF', 92),
  esp('sevilla', 'Sevilla FC', '세비야', 'SEV', '#D71920', '#FFFFFF', 559),
  esp('valencia', 'Valencia CF', '발렌시아', 'VAL', '#FFFFFF', '#F58220', 95),
  esp('villarreal', 'Villarreal CF', '비야레알', 'VIL', '#FFE667', '#005187', 94),

  // LALIGA HYPERMOTION
  esp('ceuta', 'AD Ceuta FC', 'AD 세우타', 'CEU', '#FFFFFF', '#000000'),
  esp('albacete', 'Albacete BP', '알바세테', 'ALB', '#FFFFFF', '#000000'),
  esp('burgos', 'Burgos CF', '부르고스', 'BUR', '#FFFFFF', '#000000'),
  esp('cadiz', 'Cádiz CF', '카디스', 'CAD', '#F9E000', '#004B8D', 264),
  esp('castellon', 'CD Castellón', '카스테욘', 'CAS', '#000000', '#FFFFFF'),
  esp('eldense', 'CD Eldense', '엘덴세', 'ELD', '#0054A6', '#E31B23'),
  esp('leganes', 'CD Leganés', '레가네스', 'LEG', '#0054A6', '#FFFFFF', 745),
  esp('tenerife', 'CD Tenerife', '테네리페', 'TEN', '#0054A6', '#FFFFFF'),
  esp('sabadell', 'CE Sabadell', '사바델', 'SAB', '#58B6E7', '#FFFFFF'),
  esp('celta-fortuna', 'Celta Fortuna', '셀타 포르투나', 'CLF', '#8AC3EE', '#A71930', undefined, 'celta'),
  esp('cordoba', 'Córdoba CF', '코르도바', 'COR', '#008F45', '#FFFFFF'),
  esp('andorra', 'FC Andorra', 'FC 안도라', 'AND', '#0054A6', '#E31B23'),
  esp('girona', 'Girona FC', '지로나', 'GIR', '#E30613', '#FFFFFF', 298),
  esp('granada', 'Granada CF', '그라나다', 'GRA', '#D71920', '#FFFFFF', 83),
  esp('real-sociedad-b', 'Real Sociedad B', '레알 소시에다드 B', 'RSB', '#0067B1', '#FFFFFF', undefined, 'real-sociedad'),
  esp('mallorca', 'RCD Mallorca', '마요르카', 'MLL', '#D71920', '#000000', 89),
  esp('real-oviedo', 'Real Oviedo', '레알 오비에도', 'OVI', '#0054A6', '#FFFFFF'),
  esp('sporting-gijon', 'Real Sporting', '스포르팅 히혼', 'SPG', '#D71920', '#FFFFFF'),
  esp('valladolid', 'Real Valladolid CF', '레알 바야돌리드', 'VLL', '#6F2C91', '#FFFFFF', 250),
  esp('eibar', 'SD Eibar', '에이바르', 'EIB', '#0054A6', '#D71920', 278),
  esp('almeria', 'UD Almería', '알메리아', 'ALM', '#D71920', '#FFFFFF', 267),
  esp('las-palmas', 'UD Las Palmas', '라스팔마스', 'LPA', '#F9E000', '#0054A6', 275),

  // Primera Federación, Group 1
  esp('merida', 'AD Mérida', '메리다', 'MER', '#000000', '#FFFFFF'),
  esp('arenas-club', 'Arenas Club', '아레나스 클루브', 'ARE', '#D71920', '#000000'),
  esp('athletic-b', 'Athletic Club B', '아틀레틱 클루브 B', 'ATB', '#EE2523', '#FFFFFF', undefined, 'athletic-club'),
  esp('barakaldo', 'Barakaldo CF', '바라칼도', 'BAR', '#F9E000', '#000000'),
  esp('coria', 'CD Coria', '코리아', 'COR', '#008F45', '#FFFFFF'),
  esp('extremadura', 'CD Extremadura', '엑스트레마두라', 'EXT', '#0054A6', '#D71920'),
  esp('lugo', 'CD Lugo', '루고', 'LUG', '#D71920', '#FFFFFF'),
  esp('mirandes', 'CD Mirandés', '미란데스', 'MIR', '#D71920', '#000000'),
  esp('cacereno', 'CP Cacereño', '카세레뇨', 'CAC', '#008F45', '#FFFFFF'),
  esp('cultural-leonesa', 'Cultural y Deportiva Leonesa', '쿨투랄 레오네사', 'CUL', '#FFFFFF', '#D71920'),
  esp('pontevedra', 'Pontevedra CF', '폰테베드라', 'PTV', '#7A263A', '#58B6E7'),
  esp('racing-ferrol', 'Racing Club Ferrol', '라싱 페롤', 'FER', '#008F45', '#FFFFFF'),
  esp('deportivo-fabril', 'RC Deportivo Fabril', '데포르티보 파브릴', 'FAB', '#005CA9', '#FFFFFF', undefined, 'deportivo'),
  esp('real-aviles', 'Real Avilés Industrial', '레알 아빌레스', 'AVI', '#0054A6', '#FFFFFF'),
  esp('real-union', 'Real Unión Club', '레알 우니온', 'RUN', '#000000', '#FFFFFF'),
  esp('ponferradina', 'SD Ponferradina', '폰페라디나', 'PNF', '#0054A6', '#FFFFFF'),
  esp('ud-logrones', 'UD Logroñés', 'UD 로그로녜스', 'LOG', '#D71920', '#FFFFFF'),
  esp('ourense', 'UD Ourense', '오우렌세', 'OUR', '#D71920', '#0054A6'),
  esp('unionistas', 'Unionistas de Salamanca CF', '우니오니스타스 살라망카', 'UNI', '#000000', '#FFFFFF'),
  esp('zamora', 'Zamora CF', '사모라', 'ZAM', '#D71920', '#FFFFFF'),

  // Primera Federación, Group 2
  esp('alcorcon', 'AD Alcorcón', '알코르콘', 'ALC', '#F9E000', '#0054A6'),
  esp('aguilas', 'Águilas FC', '아길라스', 'AGU', '#0054A6', '#FFFFFF'),
  esp('algeciras', 'Algeciras CF', '알헤시라스', 'ALG', '#D71920', '#FFFFFF'),
  esp('antequera', 'Antequera CCF', '안테케라', 'ANT', '#008F45', '#FFFFFF'),
  esp('atletico-madrileno', 'Atlético Madrileño', '아틀레티코 마드릴레뇨', 'AMD', '#CB3524', '#FFFFFF', undefined, 'atletico-madrid'),
  esp('teruel', 'CD Teruel', '테루엘', 'TER', '#D71920', '#0054A6'),
  esp('europa', 'CE Europa', 'CE 에우로파', 'EUR', '#0054A6', '#FFFFFF'),
  esp('rayo-majadahonda', 'CF Rayo Majadahonda', '라요 마하다온다', 'RMA', '#FFFFFF', '#0054A6'),
  esp('cartagena', 'FC Cartagena', '카르타헤나', 'CAR', '#000000', '#FFFFFF'),
  esp('gimnastic', 'Gimnàstic de Tarragona', '짐나스틱 타라고나', 'GIM', '#D71920', '#FFFFFF'),
  esp('hercules', 'Hércules de Alicante CF', '에르쿨레스', 'HER', '#0054A6', '#FFFFFF'),
  esp('juventud-torremolinos', 'Juventud de Torremolinos CF', '후벤투드 토레몰리노스', 'JUV', '#008F45', '#FFFFFF'),
  esp('real-jaen', 'Real Jaén CF', '레알 하엔', 'JAE', '#FFFFFF', '#6F2C91'),
  esp('real-madrid-castilla', 'Real Madrid Castilla', '레알 마드리드 카스티야', 'RMC', '#FFFFFF', '#FEBE10', undefined, 'real-madrid'),
  esp('real-murcia', 'Real Murcia CF', '레알 무르시아', 'MUR', '#D71920', '#FFFFFF'),
  esp('zaragoza', 'Real Zaragoza', '레알 사라고사', 'ZAR', '#FFFFFF', '#0054A6'),
  esp('huesca', 'SD Huesca', '우에스카', 'HUE', '#0054A6', '#D71920'),
  esp('ibiza', 'UD Ibiza', 'UD 이비사', 'IBI', '#58B6E7', '#FFFFFF'),
  esp('sant-andreu', 'UE Sant Andreu', '산트 안드레우', 'SAN', '#D71920', '#F9E000'),
  esp('villarreal-b', 'Villarreal CF B', '비야레알 B', 'VIB', '#FFE667', '#005187', undefined, 'villarreal'),
] as const;

export const laLigaClubIds = [
  'athletic-club', 'atletico-madrid', 'osasuna', 'celta', 'alaves', 'elche',
  'barcelona', 'getafe', 'levante', 'malaga', 'racing-santander',
  'rayo-vallecano', 'deportivo', 'espanyol', 'real-betis', 'real-madrid',
  'real-sociedad', 'sevilla', 'valencia', 'villarreal',
] as const;

const segundaClubIds = [
  'ceuta', 'albacete', 'burgos', 'cadiz', 'castellon', 'eldense', 'leganes',
  'tenerife', 'sabadell', 'celta-fortuna', 'cordoba', 'andorra', 'girona',
  'granada', 'real-sociedad-b', 'mallorca', 'real-oviedo', 'sporting-gijon',
  'valladolid', 'eibar', 'almeria', 'las-palmas',
] as const;

const primeraFederacionGroups = {
  '1': [
    'merida', 'arenas-club', 'athletic-b', 'barakaldo', 'coria', 'extremadura',
    'lugo', 'mirandes', 'cacereno', 'cultural-leonesa', 'pontevedra',
    'racing-ferrol', 'deportivo-fabril', 'real-aviles', 'real-union',
    'ponferradina', 'ud-logrones', 'ourense', 'unionistas', 'zamora',
  ],
  '2': [
    'alcorcon', 'aguilas', 'algeciras', 'antequera', 'atletico-madrileno',
    'teruel', 'europa', 'rayo-majadahonda', 'cartagena', 'gimnastic',
    'hercules', 'juventud-torremolinos', 'real-jaen', 'real-madrid-castilla',
    'real-murcia', 'zaragoza', 'huesca', 'ibiza', 'sant-andreu', 'villarreal-b',
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

export const laLiga2026: CompetitionDefinition = {
  id: 'esp-la-liga',
  countryCode: 'ESP',
  name: 'LALIGA EA SPORTS',
  nameKo: '라리가',
  tier: 1,
  professional: true,
  season: season('https://www.laliga.com/laliga-easports/clubes'),
  expectedClubCount: 20,
  rosterStatus: 'verified',
  clubIds: laLigaClubIds,
  legs: 2,
  points: standardPoints,
  tieBreakers: tableTieBreakers,
  relegation: {
    automatic: { positions: [18, 19, 20], places: 3, destinationCompetitionId: 'esp-segunda' },
  },
};

export const segunda2026: CompetitionDefinition = {
  id: 'esp-segunda',
  countryCode: 'ESP',
  name: 'LALIGA HYPERMOTION',
  nameKo: '라리가 2',
  tier: 2,
  professional: true,
  season: season('https://www.laliga.com/laliga-hypermotion/clubes'),
  expectedClubCount: 22,
  rosterStatus: 'verified',
  clubIds: segundaClubIds,
  legs: 2,
  points: standardPoints,
  tieBreakers: tableTieBreakers,
  rulesSources: [
    {
      label: 'LALIGA HYPERMOTION promotion, playoff and head-to-head context',
      url: 'https://www.laliga.com/en-GB/news/the-laliga-hypermotion-drama-continues-direct-promotion-playoff-places-and-survival-all-on-the-line',
      verifiedAt: '2026-07-28',
    },
  ],
  promotion: {
    automatic: { positions: [1, 2], places: 2, destinationCompetitionId: 'esp-la-liga' },
    playoff: { positions: [3, 4, 5, 6], places: 1, destinationCompetitionId: 'esp-la-liga' },
  },
  relegation: {
    automatic: {
      positions: [19, 20, 21, 22],
      places: 4,
      destinationCompetitionId: 'esp-primera-federacion',
    },
  },
};

export const primeraFederacion2026: CompetitionDefinition = {
  id: 'esp-primera-federacion',
  countryCode: 'ESP',
  name: 'Primera Federación',
  nameKo: '프리메라 페데라시온',
  tier: 3,
  professional: false,
  season: season('https://rfef.es/es/noticias/aprobados-los-grupos-de-primera-federacion-para-la-temporada-202627'),
  expectedClubCount: 40,
  rosterStatus: 'verified',
  groups: primeraFederacionGroups,
  clubIds: [...primeraFederacionGroups['1'], ...primeraFederacionGroups['2']],
  legs: 2,
  points: standardPoints,
  tieBreakers: tableTieBreakers,
  promotion: {
    automatic: {
      positions: [1],
      places: 1,
      scope: 'per-group',
      destinationCompetitionId: 'esp-segunda',
    },
    playoff: {
      positions: [2, 3, 4, 5],
      places: 2,
      scope: 'competition',
      destinationCompetitionId: 'esp-segunda',
      note: '두 그룹 플레이오프 참가팀 전체에서 승격 2개 구단.',
    },
  },
  relegation: {
    automatic: {
      positions: [16, 17, 18, 19, 20],
      places: 5,
      scope: 'per-group',
      externalBoundary: true,
    },
  },
  notes: [
    '스페인의 법적 프로리그 범위는 1·2부다. 3부는 승강 연결을 위한 피더 데이터로 포함한다.',
    '리저브팀은 같은 구단의 1군과 동일 디비전에 참가할 수 없으므로 승격 검증 단계에서 별도 제약이 필요하다.',
  ],
};

export const spainLeagueSystem: LeagueSystemDefinition = {
  id: 'spain-mens',
  countryCode: 'ESP',
  name: 'Spanish men’s league system',
  nameKo: '스페인 남자 리그 시스템',
  professionalTierRange: [1, 2],
  competitions: [laLiga2026, segunda2026, primeraFederacion2026],
  sources: [
    {
      label: 'LALIGA professional competition scope',
      url: 'https://www.laliga.com/sala-de-prensa/que-es-laliga',
      verifiedAt: '2026-07-28',
    },
  ],
};
