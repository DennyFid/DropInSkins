
import { RoundCalculator } from "../domain/RoundCalculator";
import { Round, Participant, HoleResult, Carryover } from "../types";

// Mock Data
const round: Round = {
    id: 1,
    totalHoles: 18,
    betAmount: 1, // $1 skins
    date: Date.now(),
    isCompleted: false,
    useCarryovers: true
};

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

        if (Math.abs(bal - expBal) > 0.01) {
            console.error(`FAIL [${p.name}]: Balance ${bal} != Expected ${expBal}`);
            passed = false;
        }
        if (skin !== expSkin) {
            console.error(`FAIL [${p.name}]: Skins ${skin} != Expected ${expSkin}`);
            passed = false;
        }
    }

    // Check remaining carryovers
    // console.log("Final Carryovers:", result.holeOutcomes.map(h => h.type), "Remaining:", result.outstandingCarryovers?.length);

    if (passed) console.log("✅ PASSED");
    else console.log("❌ FAILED");
    return result;
}

// 1. Simple Win
// A wins Hole 1. 4 Players. A gets $3. Others pay $1.
runTest("Simple Win", [
    { roundId: 1, holeNumber: 1, participantScores: { A: 3, B: 4, C: 4, D: 4 } }
], { A: 3, B: -1, C: -1, D: -1 }, { A: 1, B: 0, C: 0, D: 0 });

// 2. Simple Carryover
// H1 Tie.
// H2 A Wins.
// A wins H2 ($3). A wins H1 ($3). Total $6. Others -$2.
runTest("Simple Carryover", [
    { roundId: 1, holeNumber: 1, participantScores: { A: 4, B: 4, C: 4, D: 4 } },
    { roundId: 1, holeNumber: 2, participantScores: { A: 3, B: 4, C: 4, D: 4 } }
], { A: 6, B: -2, C: -2, D: -2 }, { A: 2, B: 0, C: 0, D: 0 });

// 3. Late Joiner (Ineligible for Carryover)
// H1 Tie.
// H2 New Player E joins (simulate by changing participants for this call? RoundCalculator takes static parts list but filters by startHole)
const playersLate = [
    { roundId: 1, name: "A", startHole: 1, endHole: 18 },
    { roundId: 1, name: "B", startHole: 1, endHole: 18 },
    { roundId: 1, name: "ComingLate", startHole: 2, endHole: 18 }, // Joins H2
];
// H1: A, B Tie.
// H2: Late wins.
// Late wins H2 (Active: A, B, Late -> 3 players. Win = $2).
// Late NOT eligible for H1. H1 remains.
// H1 (from A, B).
// Result: Late Balance +2. A -1, B -1.
// H1 Outstanding.
const res3 = RoundCalculator.calculateRoundResults(round, playersLate, [
    { roundId: 1, holeNumber: 1, participantScores: { A: 4, B: 4 } },
    { roundId: 1, holeNumber: 2, participantScores: { A: 4, B: 4, ComingLate: 3 } }
], []);

console.log("\n--- TEST: Late Joiner ---");
if (res3.balances["ComingLate"] === 2 && res3.leaderboard["ComingLate"] === 1) console.log("✅ PASSED (Wins current)");
else console.log("❌ FAILED (Balance/Skins for Late)");

// Check H1 is outstanding
// outstandingCarryovers should contain 1 element
// Wait, RoundCalculator output usually returns balance board. I added outstandingCarryovers to return.
// Let's verify standard return type doesn't have it, but strict logic check:
// Does 'A' owe for H1? No, it's not won.
// Does 'B' owe for H1? No.
// A paid $1 for H2? Yes. B paid $1 for H2? Yes.
console.log("A Balance:", res3.balances["A"], "Expected: -1");

// 4. Broken Chain
// H1 Tie (A, B, C).
// H2 Tie (A, B). C skipped H2.
// H3 A Wins (A, B, C).
// A played H1, H2, H3. Eligible for H1?
// H1 carried to H2. H2 carried to H3.
// A Matches H1 participants? Yes.
// A Matches H2 participants? Yes.
// A Wins H3.
// A should win H3, H2, H1.
// C skipped H2.
// If C had won H3?
// C matches H1? Yes.
// C matches H2? No (skipped).
// C matches H3? Yes.
// Chain H1 -> H2 -> H3.
// C missed H2.
// C wins H3 only. H1, H2 remain.

// Let's test "C Wins H3" scenario.
const playersSkip = [
    { roundId: 1, name: "A", startHole: 1, endHole: 18 },
    { roundId: 1, name: "B", startHole: 1, endHole: 18 },
    { roundId: 1, name: "C", startHole: 1, endHole: 18 }, // logic handles skipping via start/end hole usually, but here we simulate skipping via "Not Active on H2"
    // Wait, "Not Active" is determined by start/end hole intersection.
    // To simulate skipping H2 specifically but playing H3, we need separate objects or multiple entries?
    // System supports ONE Participant entry per roundId usually.
    // Actually, "Skipping a hole" is mostly "No Score Entred" or "Start/End".
    // If start/end is contiguous, they "Played" it if they were in range.
    // BUT `activeParts` filter does: `hole >= p.startHole`.
    // If C just didn't enter a score on H2?
    // `SkinsEngine` uses `activeScores`.
    // `activeParts` is determined by range.
    // If C is in Range, but didn't score?
    // `activeParts` still includes C?
    // `RoundCalculator` lines 50-52: `activeParts = participants.filter(...)`.
    // It filters by Range.
    // So if C is in range [1, 18], C is "Active".
    // But providing no score means "No Score" (or NULL).
    // `SkinsEngine` filters `activeScores`.
    // BUT `RoundCalculator` passes `activeParts` to determine potential eligibility?
    // `SkinsEngine` uses `scores` to find winner.
    // If C has no score, C loses.
    // But does C "Play" the hole?
    // "Players who ... skipped* any carried hole"
    // Usually in Apps, specific Skip button removes you from the hole?
    // If `activeParts` includes C, C "Played" (was present) but maybe got DQ/No Score.
    // If I want to simulate "Not Playing", I must ensure C is NOT in `activeParts`.
    // Currently `Participant` only supports Range (Start->End).
    // So C cannot "Skip" H2 and come back for H3 with current Data Structure?
    // Ah, unless we support multiple segments. Current interface is single segment.
    // Okay, let's assume "Left Early" (End Hole 1) and "Joined Late" (Start Hole 3).
    // For "Skipping Middle", typical usage might be "Drop Out" then "Re-Add"?
    // Which creates a new Participant record?
    // Yes, `Participant` has `id`. If C joins twice, C has 2 entries?
    // `activeParts` filter checks ALL participants.
    // If C has Entry 1 (H1-H1) and Entry 2 (H3-H3).
    // H2: Entry 1 ended. Entry 2 not started. activeParts has NO C. Correct.

    // Valid Model: C1 (1-1), C2 (3-18).
];

const playersSkipBroken = [
    { roundId: 1, name: "A", startHole: 1, endHole: 18 },
    { roundId: 1, name: "B", startHole: 1, endHole: 18 },
    { roundId: 1, name: "C", startHole: 1, endHole: 1 }, // Played H1
    { roundId: 1, name: "C", startHole: 3, endHole: 18 }, // Rejoined H3
];

// C wins H3.
// H1 Tie (A, B, C). C1 is eligible.
// H2 Tie (A, B).
// H3 C wins (C2).
// Logic:
// H1 CO: Eligible {A, B, C}.
// Winner C (aggregated name).
// Check H1: C in {A, B, C}? Yes.
// Check Range H1..H3.
// H1: Played (C1).
// H2: Played? Start/End checks.
// C1 end 1. C2 start 3. H2 is miss.
// Result: Unbroken Chain = FALSE.
// C wins H3 (Current). 
// H1, H2 remain.

const res4 = RoundCalculator.calculateRoundResults(round, playersSkipBroken, [
    { roundId: 1, holeNumber: 1, participantScores: { A: 4, B: 4, C: 4 } },
    { roundId: 1, holeNumber: 2, participantScores: { A: 4, B: 4 } }, // C not scoring not relevant if not active
    { roundId: 1, holeNumber: 3, participantScores: { A: 4, B: 4, C: 3 } }
], []);

console.log("\n--- TEST: Broken Chain (Skip H2) ---");
console.log("C Balance:", res4.balances["C"]);
// C wins H3. Active A, B, C (3 players). Win $2.
// C expects +2.
console.log("Existing H1/H2 should NOT be won.");
// H1 outstanding?
// H2 outstanding?
// We need to inspect strict output.
if (res4.balances["C"] === 2) console.log("✅ PASSED (Wins current only)");
else console.log(`❌ FAILED (C won ${res4.balances["C"]}, unexpected)`);
