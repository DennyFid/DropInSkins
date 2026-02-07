
// Mock Interfaces
export interface Player { id?: number; name: string; phone?: string; email?: string; }
export interface Round { id?: number; totalHoles: number; betAmount: number; date: number; isCompleted: boolean; useCarryovers: boolean; initialCarryoverAmount?: number; initialCarryoverEligibleNames?: string; }
export interface Participant { id?: number; roundId: number; name: string; startHole: number; endHole: number | null; }
export interface HoleResult { id?: number; roundId: number; holeNumber: number; participantScores: Record<string, number>; }
export interface Carryover { id?: number; roundId: number; originatingHole: number; amount: number; eligibleParticipantNames: string[]; isWon?: number; }
export type HoleOutcome = | { type: "Winner"; winnerName: string; score: number } | { type: "CarryoverCreated"; score: number; eligibleNames: string[] } | { type: "NoActivePlayers" };

// SkinsEngine
export class SkinsEngine {
    calculateHole(
        holeNum: number,
        scores: Record<string, number>,
        activeParticipants: Participant[],
        outstandingCarryovers: Carryover[],
        betAmount: number
    ): HoleOutcome {
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

// RoundCalculator
export class RoundCalculator {
    private static engine = new SkinsEngine();

    static calculateRoundResults(
        round: Round,
        participants: Participant[],
        holeResults: HoleResult[],
        allCarryovers: Carryover[]
    ) {
        const skinsBoard: Record<string, number> = {};
        const balanceBoard: Record<string, number> = {};

        participants.forEach(p => {
            skinsBoard[p.name] = 0;
            balanceBoard[p.name] = 0;
        });

        let currentOutstandingCOs: Carryover[] = [];

        if (round.useCarryovers) {
            const initialCOs = allCarryovers.filter(c => c.originatingHole === 0);
            if (initialCOs.length > 0) {
                currentOutstandingCOs.push(...initialCOs);
            }
        }

        const sortedResults = [...holeResults].sort((a, b) => a.holeNumber - b.holeNumber);

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

            const holeOutcomeData: any = {
                holeNumber: res.holeNumber,
                scores: res.participantScores,
                type: outcome.type,
                skinsTotal: 0,
                winners: []
            };

            if (outcome.type === "Winner") {
                const winnerName = outcome.winnerName;
                const winnerP = participants.find(p => p.name === winnerName);
                holeOutcomeData.winners = [winnerName];

                if (winnerP) {
                    const currentSkinValue = (activeParts.length - 1) * round.betAmount;

                    balanceBoard[winnerName] = (balanceBoard[winnerName] || 0) + currentSkinValue;
                    skinsBoard[winnerName] = (skinsBoard[winnerName] || 0) + 1;

                    activeParts.forEach(loser => {
                        if (loser.name !== winnerName) {
                            balanceBoard[loser.name] = (balanceBoard[loser.name] || 0) - round.betAmount;
                        }
                    });

                    const claimedCOs: Carryover[] = [];
                    const remainingCOs: Carryover[] = [];

                    for (const co of currentOutstandingCOs) {
                        const playedOrigin = co.eligibleParticipantNames.includes(winnerName);

                        let unbrokenChain = true;

                        const checkStartHole = co.originatingHole === 0 ? 1 : co.originatingHole;

                        for (let h = checkStartHole; h <= res.holeNumber; h++) {
                            const pStart = winnerP.startHole;
                            const pEnd = winnerP.endHole ?? 999;
                            if (h < pStart || h > pEnd) {
                                unbrokenChain = false;
                                break;
                            }
                        }

                        // IMPORTANT: We also need to check the implicit requirement that the chain is NOT BROKEN by eligibility?
                        // "Did not play one or more holes in the carry chain".
                        // Check implies physical presence. I checked physical presence above.
                        // But what if I was present but "ineligible" because I missed a previous hole in the chain?
                        // No, user says: "based on participation in the carried holes".
                        // If I participated in all holes, I am eligible.
                        // My check above verifies exactly that (Check participation in range).

                        if (playedOrigin && unbrokenChain) {
                            claimedCOs.push(co);
                        } else {
                            remainingCOs.push(co);
                        }
                    }

                    claimedCOs.forEach(co => {
                        const poolSize = co.eligibleParticipantNames.length;
                        const skinValue = (poolSize - 1) * co.amount;

                        balanceBoard[winnerName] += skinValue;
                        skinsBoard[winnerName] += 1;

                        co.eligibleParticipantNames.forEach(loserName => {
                            if (loserName !== winnerName) {
                                balanceBoard[loserName] = (balanceBoard[loserName] || 0) - co.amount;
                            }
                        });
                    });

                    currentOutstandingCOs = remainingCOs;
                    holeOutcomeData.skinsTotal = activeParts.length * round.betAmount;
                }

            } else if (outcome.type === "CarryoverCreated") {
                if (round.useCarryovers) {
                    const newCO: Carryover = {
                        id: Math.random(),
                        roundId: round.id!,
                        originatingHole: res.holeNumber,
                        amount: round.betAmount,
                        eligibleParticipantNames: outcome.eligibleNames,
                        isWon: 0
                    };
                    currentOutstandingCOs.push(newCO);
                    holeOutcomeData.winners = outcome.eligibleNames;
                }
            }

            holeOutcomes.push(holeOutcomeData);
        });

        // if (round.isCompleted) { ... } // Skip refund logic for validation as we confirmed it's not for Classic

        return { leaderboard: skinsBoard, balances: balanceBoard, holeOutcomes, outstandingCarryovers: currentOutstandingCOs };
    }
}

// Tests
const round: Round = { id: 1, totalHoles: 18, betAmount: 1, date: Date.now(), isCompleted: false, useCarryovers: true };
const players: Participant[] = [
    { roundId: 1, name: "A", startHole: 1, endHole: 18 },
    { roundId: 1, name: "B", startHole: 1, endHole: 18 },
    { roundId: 1, name: "C", startHole: 1, endHole: 18 },
    { roundId: 1, name: "D", startHole: 1, endHole: 18 },
];

function runTest(name: string, holes: HoleResult[], expectedBalances: Record<string, number>, expectedSkins: Record<string, number>, carryovers: Carryover[] = []) {
    console.log(`\n--- TEST: ${name} ---`);
    const result = RoundCalculator.calculateRoundResults(round, players, holes, carryovers);

    let passed = true;
    for (const p of players) {
        const bal = result.balances[p.name] || 0;
        const skin = result.leaderboard[p.name] || 0;
        const expBal = expectedBalances[p.name];
        const expSkin = expectedSkins[p.name];

        const diff = Math.abs(bal - expBal);
        if (diff > 0.01) {
            console.error(`FAIL [${p.name}]: Balance ${bal} != Expected ${expBal}`);
            passed = false;
        }
        if (skin !== expSkin) {
            console.error(`FAIL [${p.name}]: Skins ${skin} != Expected ${expSkin}`);
            passed = false;
        }
    }

    if (passed) console.log("✅ PASSED");
    else console.log("❌ FAILED");
    return result;
}

runTest("Simple Win", [
    { roundId: 1, holeNumber: 1, participantScores: { A: 3, B: 4, C: 4, D: 4 } }
], { A: 3, B: -1, C: -1, D: -1 }, { A: 1, B: 0, C: 0, D: 0 });

runTest("Simple Carryover", [
    { roundId: 1, holeNumber: 1, participantScores: { A: 4, B: 4, C: 4, D: 4 } },
    { roundId: 1, holeNumber: 2, participantScores: { A: 3, B: 4, C: 4, D: 4 } }
], { A: 6, B: -2, C: -2, D: -2 }, { A: 2, B: 0, C: 0, D: 0 });

console.log("\n--- TEST: Late Joiner ---");
const playersLate = [
    { roundId: 1, name: "A", startHole: 1, endHole: 18 },
    { roundId: 1, name: "B", startHole: 1, endHole: 18 },
    { roundId: 1, name: "ComingLate", startHole: 2, endHole: 18 },
];
const res3 = RoundCalculator.calculateRoundResults(round, playersLate, [
    { roundId: 1, holeNumber: 1, participantScores: { A: 4, B: 4 } },
    { roundId: 1, holeNumber: 2, participantScores: { A: 4, B: 4, ComingLate: 3 } }
], []);

if (res3.balances["ComingLate"] === 2 && res3.leaderboard["ComingLate"] === 1) console.log("✅ PASSED (Wins current)");
else console.log(`❌ FAILED LAT: ${res3.balances["ComingLate"]}`);
console.log("A Balance:", res3.balances["A"], "(Exp: -1)");
if (Math.abs(res3.balances["A"] - (-1)) < 0.01) console.log("✅ PASSED (A Balance correct)");
else console.log("❌ FAILED (A Balance incorrect)");

// Broken Chain
console.log("\n--- TEST: Broken Chain (Skip H2) ---");
const playersSkipBroken = [
    { roundId: 1, name: "A", startHole: 1, endHole: 18 },
    { roundId: 1, name: "B", startHole: 1, endHole: 18 },
    { roundId: 1, name: "C", startHole: 1, endHole: 1 },
    { roundId: 1, name: "C", startHole: 3, endHole: 18 },
];
// Note RoundCalculator sorts activeParts by scanning participant list. 
// For "C", it will find 2 entries?
// `participants.forEach` initializes the board.
// If names duplicate, `skinsBoard[C]` overwrites 0.
// `balanceBoard` tracks by name.
// So this works for simulation if `RoundCalculator` aggregation handles Name collision by shared key.
// The code `skinsBoard[p.name] = 0` resets it. If "C" appears twice, it resets twice to 0. Fine.
// `activeParts` filter: checks if `p` is active.
// H1: P(A), P(B), P(C1). Active: A, B, C.
// H2: P(A), P(B). C1 (End 1). C2 (Start 3). Active: A, B.
// H3: P(A), P(B), P(C2). Active: A, B, C.
// Logic check for C winning H3:
// Range H1..H3.
// Does Winner P(C2) play H1?
// `winnerP` is `participants.find(name === WinnerName)`.
// It finds FIRST "C" (C1).
// C1 start 1, end 1.
// Check Range H1..H3.
// Loop H=1. Active? Yes.
// Loop H=2. Active? (1 <= 1 && 2 <= 1) -> No.
// Broken Chain.
// Correct! Even if we found C2, C2 start 3. H1 active? No.
// So checking against *any* single participant record correctly identifies the gap if they are separate records.
// If they were one record with "skips", our `Participant` interface doesn't support that, so this multi-record approach is the only way, and currently checking `find` returns one.
// This confirms logic robustly handles "Gap".

const res4 = RoundCalculator.calculateRoundResults(round, playersSkipBroken, [
    { roundId: 1, holeNumber: 1, participantScores: { A: 4, B: 4, C: 4 } },
    { roundId: 1, holeNumber: 2, participantScores: { A: 4, B: 4 } },
    { roundId: 1, holeNumber: 3, participantScores: { A: 4, B: 4, C: 3 } }
], []);

console.log("C Balance:", res4.balances["C"]);
if (Math.abs(res4.balances["C"] - 2) < 0.01) console.log("✅ PASSED (Wins current only)");
else console.log(`❌ FAILED (C won ${res4.balances["C"]}, unexpected)`);
