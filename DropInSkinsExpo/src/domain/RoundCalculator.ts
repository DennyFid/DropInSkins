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
        const grossWonBoard: Record<string, number> = {};
        const grossLostBoard: Record<string, number> = {};

        // Initialize boards
        participants.forEach(p => {
            skinsBoard[p.name] = 0;
            balanceBoard[p.name] = 0;
            grossWonBoard[p.name] = 0;
            grossLostBoard[p.name] = 0;
        });

        console.log(`[RoundCalc] Starting calculation for round ${round.id}. Total COs in history: ${allCarryovers.length}`);

        // We track outstanding skins. Each "Skin" is an object representing a hole that hasn't been won yet.
        // It persists until won.
        let currentOutstandingCOs: Carryover[] = [];

        // Only process carryovers if the round is configured to use them
        if (round.useCarryovers) {
            const initialCOs = allCarryovers.filter(c => c.originatingHole === 0);
            if (initialCOs.length > 0) {
                console.log(`[RoundCalc] Seeding ${initialCOs.length} inherited carryovers:`, initialCOs);
                currentOutstandingCOs.push(...initialCOs);
                // In Classic Skins, inherited skins just sit in the pool waiting to be won.
                // No initial deduction needed because the payment happens when won.
            }
        }

        const sortedResults = [...holeResults].sort((a, b) => a.holeNumber - b.holeNumber);

        const holeOutcomes: any[] = [];
        const processedCarryoverIds = new Set<number>(); // Track which DB COs we've loaded

        sortedResults.forEach(res => {
            const activeParts = participants.filter(p =>
                res.holeNumber >= p.startHole && (p.endHole === null || res.holeNumber <= p.endHole)
            );

            const outcome = this.engine.calculateHole(
                res.holeNumber,
                res.participantScores,
                activeParts,
                currentOutstandingCOs, // passed for reference, but engine doesn't use it anymore for logic
                round.betAmount
            );

            const holeOutcomeData: any = {
                holeNumber: res.holeNumber,
                scores: res.participantScores,
                type: outcome.type,
                skinsTotal: 0, // Calculated below
                winners: []
            };

            if (outcome.type === "Winner") {
                const winnerName = outcome.winnerName;
                const winnerP = participants.find(p => p.name === winnerName);
                holeOutcomeData.winners = [winnerName];

                if (winnerP) {
                    // 1. Winner wins the Current Hole Skin
                    // Value: (ActivePlayers - 1) * Bet
                    const currentSkinValue = (activeParts.length - 1) * round.betAmount;

                    // Transaction: Winner gets Value.
                    balanceBoard[winnerName] = (balanceBoard[winnerName] || 0) + currentSkinValue;
                    grossWonBoard[winnerName] = (grossWonBoard[winnerName] || 0) + currentSkinValue;
                    skinsBoard[winnerName] = (skinsBoard[winnerName] || 0) + 1;

                    // Transaction: Losers (active) pay Bet.
                    activeParts.forEach(loser => {
                        if (loser.name !== winnerName) {
                            balanceBoard[loser.name] = (balanceBoard[loser.name] || 0) - round.betAmount;
                            grossLostBoard[loser.name] = (grossLostBoard[loser.name] || 0) + round.betAmount;
                        }
                    });

                    // 2. Check Chain Eligibility for Carryovers
                    // "Only players who were active on all carried holes are eligible to win the carried skins"
                    // Chain validation: For a CO from OriginHole, did Winner play OriginHole...CurrentHole?

                    const claimedCOs: Carryover[] = [];
                    const remainingCOs: Carryover[] = [];

                    for (const co of currentOutstandingCOs) {
                        // Check 1: Was Winner in the original pool? (Part of eligibility list)
                        const playedOrigin = co.eligibleParticipantNames.includes(winnerName);

                        // Check 2: Did Winner play all intermediate holes?
                        let unbrokenChain = true;

                        // If Origin is 0 (Previous Round), we treat it as "Available if you played Hole 1 onwards"?
                        // Or "Available if you played Origin Round"? 
                        // Usually carried skins from previous round are available to everyone who starts Round 2.
                        // So for Origin=0, we check participation from Hole 1 to Current.
                        const checkStartHole = co.originatingHole === 0 ? 1 : co.originatingHole;

                        for (let h = checkStartHole; h <= res.holeNumber; h++) {
                            const pStart = winnerP.startHole;
                            const pEnd = winnerP.endHole ?? 999;
                            if (h < pStart || h > pEnd) {
                                unbrokenChain = false;
                                break;
                            }
                        }

                        if (unbrokenChain) {
                            claimedCOs.push(co);
                        } else {
                            remainingCOs.push(co);
                        }
                    }

                    // Process Claimed COs
                    claimedCOs.forEach(co => {
                        // Value of this carried skin = (Original Participants - 1) * CO Amount (Bet)
                        // Note: co.eligibleParticipantNames stores the participants on the originating hole.
                        const poolSize = co.eligibleParticipantNames.length;
                        const skinValue = (poolSize - 1) * co.amount;

                        balanceBoard[winnerName] += skinValue;
                        grossWonBoard[winnerName] += skinValue;
                        skinsBoard[winnerName] += 1;

                        // Losers from the ORIGINATING hole pay.
                        // We must find them. They are in co.eligibleParticipantNames.
                        // Wait, do we deduct from them NOW?
                        // Yes. "Classic" means you pay when it is WON.
                        // So even if they left the game, they owe this money because they lost the skin they tied on.
                        // This might result in people who left having negative balances. This is correct for Classic Skins.

                        co.eligibleParticipantNames.forEach(loserName => {
                            if (loserName !== winnerName) {
                                balanceBoard[loserName] = (balanceBoard[loserName] || 0) - co.amount;
                                grossLostBoard[loserName] = (grossLostBoard[loserName] || 0) + co.amount;
                            }
                        });
                    });

                    // Update Outstanding List
                    currentOutstandingCOs = remainingCOs;

                    // Update Report Data
                    holeOutcomeData.skinsTotal = activeParts.length * round.betAmount; // Approximate "Pot" visual for UI, though logic is per-person
                }

            } else if (outcome.type === "CarryoverCreated") {
                // Tie - Create a new Carryover Object
                // No money changes hands.

                if (round.useCarryovers) {
                    const newCO: Carryover = {
                        id: Math.random(), // Temporary ID for simulation
                        roundId: round.id!,
                        originatingHole: res.holeNumber,
                        amount: round.betAmount,
                        eligibleParticipantNames: outcome.eligibleNames, // Players active on this hole
                        isWon: 0
                    };
                    currentOutstandingCOs.push(newCO);
                    holeOutcomeData.winners = outcome.eligibleNames; // "Winners" of the tie (eligible for next)
                }
            }

            holeOutcomes.push(holeOutcomeData);
        });

        // "Refund" logic is NOT valid for Classic Skins because skins just stay outstanding.
        // Or do we expire them? 
        // User said: "Losses are uncapped". "Carried skins... inherited by next round".
        // So we do NOT refund. They remain in the "currentOutstandingCOs" to be saved to DB for next round.
        // We might want to return them so the DB can update.

        return {
            leaderboard: skinsBoard,
            balances: balanceBoard,
            grossWinnings: grossWonBoard,
            grossLosses: grossLostBoard,
            holeOutcomes,
            outstandingCarryovers: currentOutstandingCOs
        };
    }
}
