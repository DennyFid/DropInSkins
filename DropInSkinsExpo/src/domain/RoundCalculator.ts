import { Round, Participant, HoleResult, Carryover } from "../types";
import { SkinsEngine } from "./SkinsEngine";

export class RoundCalculator {
    private static engine = new SkinsEngine();

    /**
     * Calculates the leaderboard and net balances for a complete or partial round.
     */
    static calculateRoundResults(
        round: Round,
        participants: Participant[],
        holeResults: HoleResult[],
        allCarryovers: Carryover[]
    ) {
        const skinsBoard: Record<string, number> = {};
        const balanceBoard: Record<string, number> = {};

        // Initialize boards
        participants.forEach(p => {
            skinsBoard[p.name] = 0;
            balanceBoard[p.name] = 0;
        });

        console.log(`[RoundCalc] Starting calculation for round ${round.id}. Total COs in history: ${allCarryovers.length}`);
        let currentOutstandingCOs: Carryover[] = [];

        // Only process carryovers if the round is configured to use them
        if (round.useCarryovers) {
            const initialCOs = allCarryovers.filter(c => c.originatingHole === 0);
            if (initialCOs.length > 0) {
                console.log(`[RoundCalc] Seeding ${initialCOs.length} inherited carryovers:`, initialCOs);
                currentOutstandingCOs.push(...initialCOs);

                // Deduct the value of inherited carryovers from eligible participants' start balances
                // so that the simulation "funds" the starting pot.
                initialCOs.forEach(co => {
                    co.eligibleParticipantNames.forEach(name => {
                        balanceBoard[name] = (balanceBoard[name] || 0) - co.amount;
                    });
                });
            }
        }

        const sortedResults = [...holeResults].sort((a, b) => a.holeNumber - b.holeNumber);
        console.log(`[RoundCalc] Simulating round with ${sortedResults.length} holes and ${allCarryovers.length} total COs available in history.`);

        const holeOutcomes: any[] = [];
        sortedResults.forEach(res => {
            const activeParts = participants.filter(p =>
                res.holeNumber >= p.startHole && (p.endHole === null || res.holeNumber <= p.endHole)
            );

            const outcome = this.engine.calculateHole(
                res.holeNumber,
                res.participantScores,
                activeParts,
                currentOutstandingCOs,
                round.betAmount
            );

            holeOutcomes.push({
                holeNumber: res.holeNumber,
                scores: res.participantScores,
                type: outcome.type,
                skinsTotal: round.betAmount * activeParts.length,
                winners: outcome.type === "Winner" ? [outcome.winnerName] : (outcome.type === "CarryoverCreated" ? outcome.eligibleNames : [])
            });

            if (outcome.type === "Winner") {
                // Deduct bet for current hole from all active participants
                activeParts.forEach(p => {
                    balanceBoard[p.name] = (balanceBoard[p.name] || 0) - round.betAmount;
                });

                // Skin count is 1 (the hole itself) + any claimed carryover holes
                const skinCount = 1 + outcome.claimedCarryoverIds.length;
                skinsBoard[outcome.winnerName] = (skinsBoard[outcome.winnerName] || 0) + skinCount;

                // Winner takes the hole pot (sum of all active participants' bets for this hole)
                let holeWinnings = activeParts.length * round.betAmount;

                // Add claimed carryovers to the winner's winnings
                outcome.claimedCarryoverIds.forEach(coId => {
                    const co = currentOutstandingCOs.find(c => c.id === coId);
                    if (co) {
                        // For mid-round COs, the participants already paid co.amount on the originating hole.
                        // The total pot for that CO is co.amount * number of people who tied.
                        holeWinnings += co.amount * co.eligibleParticipantNames.length;
                    }
                });

                balanceBoard[outcome.winnerName] = (balanceBoard[outcome.winnerName] || 0) + holeWinnings;

                currentOutstandingCOs = currentOutstandingCOs.filter(co => !outcome.claimedCarryoverIds.includes(co.id || -1));
            } else if (outcome.type === "CarryoverCreated") {
                // Deduct bet for current hole from all active participants to fund the CO
                activeParts.forEach(p => {
                    balanceBoard[p.name] = (balanceBoard[p.name] || 0) - round.betAmount;
                });

                // Only create/carry over if allowed
                if (round.useCarryovers) {
                    // Find the ACTUAL CO object from the provided carryovers for this hole
                    // This ensures we use the persisted CO object with its correct ID and details
                    const dbCOs = allCarryovers.filter(c => c.originatingHole === res.holeNumber);
                    if (dbCOs.length > 0) {
                        currentOutstandingCOs.push(...dbCOs);
                    } else {
                        // Fallback for simulation of rounds without full DB persistence (if needed)
                        // This creates a temporary CO object if no persisted one is found for the current hole.
                        currentOutstandingCOs.push({
                            id: Math.random(), // Assign a temporary ID
                            roundId: round.id!,
                            originatingHole: res.holeNumber,
                            amount: outcome.amount,
                            eligibleParticipantNames: outcome.eligibleNames,
                            isWon: 0
                        });
                    }
                }
            }
        });

        // Final adjustment: If the round is completed, unsettled carryovers are effectively 
        // "refunded" to ensure the total Net balances sum to zero.
        if (round.isCompleted) {
            console.log(`[RoundCalc] Round finished with ${currentOutstandingCOs.length} unsettled carryovers. Refunding...`);
            currentOutstandingCOs.forEach(co => {
                co.eligibleParticipantNames.forEach(name => {
                    balanceBoard[name] = (balanceBoard[name] || 0) + co.amount;
                });
            });
        }

        return { leaderboard: skinsBoard, balances: balanceBoard, holeOutcomes };
    }
}
