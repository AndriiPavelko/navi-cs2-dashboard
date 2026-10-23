export type PersonInMatch = {
  name: string;
  displayname: string;
  flag: string;
  kills: number | null;
  deaths: number | null;
};

export type MapVM = {
  id: string;
  name: string;
  navi: number | null;
  opp: number | null;
  naviWon: boolean | null;
  vod: string | null;
};

export type SeriesVM = {
  id: string;
  at: string;
  tournament: string;
  section: string | null;
  eventLabel: string;
  tier: string | null;
  eventType: string | null;
  bestOf: number | null;
  pageName: string | null;
  opponent: string;
  naviScore: number | null;
  oppScore: number | null;
  naviWon: boolean | null;
  finished: boolean;
  winLow: number | null;
  winHigh: number | null;
  reasons: string[];
  mapsLow: number | null;
  mapsHigh: number | null;
  mapReasons: string[];
  naviPlayers: PersonInMatch[];
  oppPlayers: PersonInMatch[];
  maps: MapVM[];
};

export type PlayerVM = {
  id: string;
  nickname: string;
  realName: string | null;
  country: string | null;
  role: string | null;
  isCoach: boolean;
  joinDate: string | null;
  url: string | null;
};

export type PostVM = {
  id: string;
  source: string;
  author: string;
  title: string | null;
  body: string | null;
  url: string;
  publishedAt: string | null;
  tone: "спокійно" | "зібрано" | "напружено";
};

export type SeasonStats = {
  series: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: string;
  mapWins: number;
  mapLosses: number;
  streak: string;
};
