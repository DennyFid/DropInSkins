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
            // One winner - takes the skin + any eligible carryovers
            const winnerKey = winnerName.trim().toLowerCase();
            const eligibleCOs = outstandingCarryovers.filter(co =>
                co.eligibleParticipantNames.some(name => name.trim().toLowerCase() === winnerKey)
            );

            console.log(`[Engine] Winner: ${winnerName}. Pool size: ${outstandingCarryovers.length}. Eligible COs: ${eligibleCOs.length}`);
            if (outstandingCarryovers.length > 0 && eligibleCOs.length === 0) {
                console.log(`[Engine] Available COs for this hole:`, outstandingCarryovers.map(c => ({ hole: c.originatingHole, players: c.eligibleParticipantNames })));
            }

            const totalCOAmount = eligibleCOs.reduce((sum, co) => sum + co.amount, 0);

            return {
                type: "Winner",
                winnerName: winnerName,
                totalWon: betAmount + totalCOAmount,
                claimedCarryoverIds: eligibleCOs.map(co => co.id).filter((id): id is number => id !== undefined),
                carryoverCreated: false,
            };
        } else {
            // Tie - carryover created from current hole's bet
            const eligibleNames = activeParticipants
                .filter((p) => this.isParticipantActive(p, holeNum))
                .map((p) => p.name);

            return {
                type: "CarryoverCreated",
                amount: betAmount, // Just the current bet carries over
                eligibleNames,
            };
        }
    }

    private isParticipantActive(p: Participant, hole: number): boolean {
        return hole >= p.startHole && (p.endHole === null || hole <= p.endHole);
    }
}
