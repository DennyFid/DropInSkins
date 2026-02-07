import { Participant, HoleOutcome, Carryover } from "../types";

/**
 * Core engine for calculating skins, carryovers, and participant eligibility.
 */
export class SkinsEngine {
    /**
     * Calculates the results for a specific hole.
     */
    calculateHole(
        holeNum: number,
        scores: Record<string, number>,
        activeParticipants: Participant[],
        outstandingCarryovers: Carryover[],
        betAmount: number
    ): HoleOutcome {
        // Filter scores to only include participants who are active on this hole and have entered a valid score (> 0)
        const activeScores = Object.entries(scores).filter(([name, score]) => {
            const p = activeParticipants.find((part) => part.name === name);
            const isValidScore = score !== null && score !== undefined && score > 0;
            return p && isValidScore && this.isParticipantActive(p, holeNum);
        });

        if (activeScores.length === 0) return { type: "NoActivePlayers" };

        const scoreValues = activeScores.map(([, score]) => score);
        const minScore = Math.min(...scoreValues);
        const winners = activeScores.filter(([, score]) => score === minScore).map(([name]) => name);

        if (winners.length === 1) {
            const winnerName = winners[0];
            return {
                type: "Winner",
                winnerName: winnerName,
                score: minScore
            };
        } else {
            // Tie - carryover created
            const eligibleNames = activeParticipants
                .filter((p) => this.isParticipantActive(p, holeNum))
                .map((p) => p.name);

            return {
                type: "CarryoverCreated",
                score: minScore,
                eligibleNames,
            };
        }
    }

    private isParticipantActive(p: Participant, hole: number): boolean {
        return hole >= p.startHole && (p.endHole === null || hole <= p.endHole);
    }
}
