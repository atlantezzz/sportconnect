export type ActivityMember = {
  id: number;
  name: string;
};

export type Activity = {
  id: number;
  sport: string;
  title: string;
  location: string;
  time: string;
  participants: number;
  capacity: number;
  level: string;
  description: string;
  organizer: string;
  organizerId?: number;
  memberNames: string[];
  members?: ActivityMember[];
  x: number;
  y: number;
  latitude?: number | null;
  longitude?: number | null;
  status?: "GEANNULEERD";
};
