export interface Player {
  id?: number;
  name: string;
  phone?: string;
  email?: string;
}

export interface Round {
  id?: number;
  totalHoles: number;
  betAmount: number;
  date: number;
  isCompleted: boolean;
  useCarryovers: boolean;
  initialCarryoverAmount?: number;
  initialCarryoverEligibleNames?: string; // JSON string in DB, but let's handle it as string for the interface or string[] if we parse it
}

export interface Participant {
  id?: number;
  roundId: number;
  name: string;
  startHole: number;
  endHole: number | null;
}

export interface HoleResult {
  id?: number;
  roundId: number;
  holeNumber: number;
  participantScores: Record<string, number>; // Name -> Score
}

export interface Carryover {
  id?: number;
  roundId: number;
  originatingHole: number;
  amount: number;
  eligibleParticipantNames: string[];
  isWon?: number;
}

export type HoleOutcome =
  | { type: "Winner"; winnerName: string; score: number }
  | { type: "CarryoverCreated"; score: number; eligibleNames: string[] }
  | { type: "NoActivePlayers" };

export interface RoundExport {
  round: Round;
  participants: Participant[];
  holeResults: HoleResult[];
  carryovers: Carryover[];
}
