
import { RoundCalculator } from "../domain/RoundCalculator";
import { Round, Participant, HoleResult, Carryover } from "../types";

// Setup: 4 Players. Bet $100.
const round: Round = { id: 1, totalHoles: 18, betAmount: 100, date: Date.now(), isCompleted: false, useCarryovers: true };
const players: Participant[] = [
    { roundId: 1, name: "A", startHole: 1, endHole: 18 },
    { roundId: 1, name: "B", startHole: 1, endHole: 18 },
    { roundId: 1, name: "C", startHole: 1, endHole: 18 },
    { roundId: 1, name: "D", startHole: 1, endHole: 18 },
];

// Scenario: A scores 5. B, C, D have NO score (undefined/null).
// Current Expected: B,C,D considered "Active" via range, so they Pay.
// A wins $300. B, C, D pay $100.
// Desired (Hypothesis): B,C,D do not pay. A wins $0 (solo) or Game doesn't count.
// Let's test checking what happens now.

const holes: HoleResult[] = [
    { roundId: 1, holeNumber: 1, participantScores: { A: 5 } } // B, C, D missing
];

const result = RoundCalculator.calculateRoundResults(round, players, holes, []);

console.log("--- Payout Test ---");
console.log("A Balance:", result.balances["A"]);
console.log("B Balance:", result.balances["B"]);
console.log("C Balance:", result.balances["C"]);
console.log("D Balance:", result.balances["D"]);

if (result.balances["A"] === 300) {
    console.log("STATUS: CURRENT (No Score = Pay)");
} else {
    console.log("STATUS: CHANGED or OTHER");
}
