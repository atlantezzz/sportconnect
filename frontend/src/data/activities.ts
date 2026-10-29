import type { Activity } from "@/types/activity";

export const activities: Activity[] = [

  {

    id: 1,

    sport: "Hardlopen",

    title: "Avondrondje door het park",

    location: "Stadswandelpark, Eindhoven",

    time: "Vandaag, 19:00",

    participants: 3,

    capacity: 6,

    level: "Gemiddeld",

    description:

      "We maken samen een ontspannen rondje door het Stadswandelpark. We lopen op een tempo waarop iedereen kan meekomen. Neem hardloopschoenen en wat water mee.",

    organizer: "Thomas",

    memberNames: ["Thomas", "Lisa", "Milan"],

    x: 47,

    y: 36,

  },

  {

    id: 2,

    sport: "Fitness",

    title: "Samen fitnessen",

    location: "Basic-Fit, Eindhoven",

    time: "Vandaag, 18:30",

    participants: 8,

    capacity: 8,

    level: "Alle niveaus",

    description:

      "Samen trainen en elkaar motiveren tijdens een fitnesssessie. Iedereen kan zijn eigen trainingsschema volgen. We spreken af bij de ingang.",

    organizer: "Daan",

    memberNames: ["Daan", "Sophie", "Sem", "Noah", "Eva", "Lars", "Finn", "Mila"],

    x: 66,

    y: 53,

  },

  {

    id: 3,

    sport: "Voetbal",

    title: "Voetbal op het veld",

    location: "Genneper Parken, Eindhoven",

    time: "Morgen, 17:00",

    participants: 9,

    capacity: 14,

    level: "Alle niveaus",

    description:

      "Een informele pot voetbal met teams die we ter plekke indelen. Ervaring is niet nodig; plezier en samen sporten staan voorop.",

    organizer: "Jesse",

    memberNames: ["Jesse", "Max", "Ruben", "Luca", "Sam", "Tim", "Niels", "Bram", "Jay"],

    x: 30,

    y: 69,

  },

  {

    id: 4,

    sport: "Padel",

    title: "Padel voor beginners",

    location: "Indoor Sportcentrum, Eindhoven",

    time: "Morgen, 19:30",

    participants: 2,

    capacity: 4,

    level: "Beginner",

    description:

      "Wil je padel leren spelen? We oefenen de basis en spelen daarna een paar korte potjes. Padelrackets kunnen we onderling afstemmen.",

    organizer: "Emma",

    memberNames: ["Emma", "Julia"],

    x: 73,

    y: 27,

  },

  {

    id: 5,

    sport: "Basketbal",

    title: "Basketbal op het plein",

    location: "Centrum, Eindhoven",

    time: "Zaterdag, 14:00",

    participants: 4,

    capacity: 10,

    level: "Gemiddeld",

    description:

      "Een recreatief potje basketbal met ruimte voor nieuwe spelers. We verdelen de teams als iedereen er is.",

    organizer: "Youssef",

    memberNames: ["Youssef", "Amir", "Dylan", "Levi"],

    x: 54,

    y: 61,

  },

  {

    id: 6,

    sport: "Hardlopen",

    title: "Rustige ochtendrun",

    location: "TU/e campus, Eindhoven",

    time: "Zondag, 09:00",

    participants: 2,

    capacity: 6,

    level: "Beginner",

    description:

      "Een rustige ochtendrun voor iedereen die het hardlopen wil oppakken of ontspannen aan de dag wil beginnen.",

    organizer: "Noor",

    memberNames: ["Noor", "Sanne"],

    x: 61,

    y: 18,

  },

];

export const sports = [
  "Alles", "Hardlopen", "Fitness", "Voetbal", "Padel", "Basketbal",
  "Wandelen", "Fietsen", "Wielrennen", "Zwemmen", "Tennis", "Badminton",
  "Volleybal", "Hockey", "Yoga", "Krachttraining", "Trailrunning",
  "Mountainbiken", "Tafeltennis", "Handbal", "Rugby", "Golf", "Boksen",
  "Kickboksen", "Judo", "Klimmen", "Boulderen", "Dansen", "Roeien", "Vissen",
  "Anders",
];

export const sportEmoji: Record<string, string> = {
  "Alles": "✦", "Hardlopen": "🏃", "Fitness": "🏋️", "Voetbal": "⚽",
  "Padel": "🎾", "Basketbal": "🏀", "Wandelen": "🥾", "Fietsen": "🚲",
  "Wielrennen": "🚴", "Zwemmen": "🏊", "Tennis": "🎾", "Badminton": "🏸",
  "Volleybal": "🏐", "Hockey": "🏑", "Yoga": "🧘", "Krachttraining": "🏋️",
  "Trailrunning": "🏃", "Mountainbiken": "🚵", "Tafeltennis": "🏓",
  "Handbal": "🤾", "Rugby": "🏉", "Golf": "⛳", "Boksen": "🥊",
  "Kickboksen": "🥊", "Judo": "🥋", "Klimmen": "🧗", "Boulderen": "🧗",
  "Dansen": "💃", "Roeien": "🚣", "Vissen": "🎣", "Anders": "＋",
};

export const sportColors: Record<string, string> = {

  Hardlopen: "bg-emerald-50 text-emerald-700",

  Fitness: "bg-orange-50 text-orange-700",

  Voetbal: "bg-blue-50 text-blue-700",

  Padel: "bg-violet-50 text-violet-700",

  Basketbal: "bg-amber-50 text-amber-700",

};
