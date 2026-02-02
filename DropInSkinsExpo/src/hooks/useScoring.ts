import { useState, useEffect } from "react";
import { DatabaseService } from "../data/database";
import { SkinsEngine } from "../domain/SkinsEngine";
import { RoundCalculator } from "../domain/RoundCalculator";
import { Round, Participant, HoleResult, Carryover } from "../types";

export const useScoring = (roundId: number) => {
    const [currentHole, setCurrentHole] = useState(1);
    const [round, setRound] = useState<Round | null>(null);
    const [participants, setParticipants] = useState<Participant[]>([]);
    const [holeResults, setHoleResults] = useState<HoleResult[]>([]);
    const [carryovers, setCarryovers] = useState<Carryover[]>([]);
    const [loading, setLoading] = useState(true);

    const engine = new SkinsEngine();

    useEffect(() => {
        loadData();
    }, [roundId]);

    const loadData = async () => {
        setLoading(true);
        try {
            const r = await DatabaseService.getRoundById(roundId);
            if (r) setRound(r);

            const parts = await DatabaseService.getParticipants(roundId);
            setParticipants(parts);

            const results = await DatabaseService.getHoleResults(roundId);
            setHoleResults(results);

            const cos = await DatabaseService.getRoundHistoryCarryovers(roundId);
            setCarryovers(cos);
        } catch (error) {
            console.error("[useScoring] Error loading data:", error);
        } finally {
            setLoading(false);
        }
    };

    const [leaderboard, setLeaderboard] = useState<Record<string, number>>({});
    const [balances, setBalances] = useState<Record<string, number>>({});

    useEffect(() => {
        if (!round) return;

        const { leaderboard: newLeaderboard, balances: newBalances } = RoundCalculator.calculateRoundResults(
            round,
            participants,
            holeResults,
            carryovers
        );

        setLeaderboard(newLeaderboard);
        setBalances(newBalances);
    }, [holeResults, participants, round, carryovers]);

    const joinRound = async (name: string) => {
        try {
            await DatabaseService.addParticipant(roundId, name, currentHole);
            await loadData();
        } catch (error) {
            console.error("[useScoring] Error joining round:", error);
        }
    };

    const leaveRound = async (participantId: number) => {
        try {
            await DatabaseService.updateParticipantEndHole(participantId, currentHole - 1);
            await loadData();
        } catch (error) {
            console.error("[useScoring] Error leaving round:", error);
        }
    };

    const submitScore = async (scores: Record<string, number>) => {
        if (!round) return;

        try {
            // 1. Save the new score for the current hole (Overwrite existing)
            // We do this first so it's included in the "re-play"
            await DatabaseService.deleteHoleData(roundId, currentHole);
            await DatabaseService.saveHoleResult(roundId, currentHole, scores);

            // 2. Reset ALL carryover state for this round
            // This deletes COs generated active in this round and resets inherited ones
            await DatabaseService.resetRoundCarryovers(roundId);

            // 3. Fetch ALL hole results for the round (sorted)
            const allResults = await DatabaseService.getHoleResults(roundId);
            const sortedResults = allResults.sort((a, b) => a.holeNumber - b.holeNumber);

            // 4. Fetch the initial (Hole 0) carryovers to start the pool
            const roundCOs = await DatabaseService.getRoundHistoryCarryovers(roundId);
            let currentPool: Carryover[] = roundCOs.filter(c => c.originatingHole === 0);

            // 5. Re-play the round history hole by hole
            for (const res of sortedResults) {
                const activeParts = participants.filter(p =>
                    res.holeNumber >= p.startHole && (p.endHole === null || res.holeNumber <= p.endHole)
                );

                const outcome = engine.calculateHole(
                    res.holeNumber,
                    res.participantScores,
                    activeParts,
                    currentPool,
                    round.betAmount
                );

                if (outcome.type === "Winner") {
                    // Mark claimed carryovers as won in DB
                    for (const coId of outcome.claimedCarryoverIds) {
                        await DatabaseService.markCarryoverAsWon(coId);
                    }
                    // Remove claimed COs from the running pool
                    currentPool = currentPool.filter(co => !outcome.claimedCarryoverIds.includes(co.id || -1));

                } else if (outcome.type === "CarryoverCreated") {
                    // Create the new carryover in DB
                    // Only if carryovers are enabled for this round
                    if (round.useCarryovers) {
                        const newIdResult = await DatabaseService.saveCarryover(roundId, res.holeNumber, outcome.amount, outcome.eligibleNames);
                        // Add to running pool with the new DB ID
                        currentPool.push({
                            id: Number(newIdResult), // Ensure ID is captured
                            roundId,
                            originatingHole: res.holeNumber,
                            amount: outcome.amount,
                            eligibleParticipantNames: outcome.eligibleNames,
                            isWon: 0
                        });
                    }
                }
            }

            await loadData();

            // Only advance if we are at the latest hole (checking if we just edited a historic one)
            // If we edited a historic hole, currentHole is likely < maxHole, so maybe don't auto-advance?
            // User request implied "edit function", usually you stay put or go back. 
            // Standard flow: if currentHole is the next one to play (no results ahead), advance.
            const maxPlayedHole = sortedResults.length > 0 ? sortedResults[sortedResults.length - 1].holeNumber : 0;
            if (currentHole > maxPlayedHole) {
                if (currentHole < round.totalHoles) {
                    setCurrentHole(prev => prev + 1);
                }
            }
        } catch (error) {
            console.error("[useScoring] Error submitting score:", error);
        }
    };

    return {
        currentHole,
        setCurrentHole,
        round,
        participants,
        leaderboard,
        balances,
        holeResults,
        carryovers,
        loading,
        submitScore,
        joinRound,
        leaveRound
    };
};
