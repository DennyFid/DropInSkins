import { RoundCalculator } from "../domain/RoundCalculator";
import { useMemo, useState, useEffect, useCallback } from "react";
import { DatabaseService } from "../data/database";
import { SkinsEngine } from "../domain/SkinsEngine";
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

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [r, parts, results, cos] = await Promise.all([
                DatabaseService.getRoundById(roundId),
                DatabaseService.getParticipants(roundId),
                DatabaseService.getHoleResults(roundId),
                DatabaseService.getRoundHistoryCarryovers(roundId)
            ]);

            if (r) setRound(r);
            setParticipants(parts);
            setHoleResults(results);
            setCarryovers(cos);
        } catch (error) {
            console.error("[useScoring] Error loading data:", error);
        } finally {
            setLoading(false);
        }
    }, [roundId]);

    const calculationResults = useMemo(() => {
        if (!round) return { leaderboard: {} as Record<string, number>, balances: {} as Record<string, number>, holeOutcomes: [] as any[] };
        return RoundCalculator.calculateRoundResults(
            round,
            participants,
            holeResults,
            carryovers
        );
    }, [round, participants, holeResults, carryovers]);

    const leaderboard = calculationResults.leaderboard;
    const balances = calculationResults.balances;
    const holeOutcomes = calculationResults.holeOutcomes;

    const joinRound = useCallback(async (name: string) => {
        try {
            await DatabaseService.addParticipant(roundId, name, currentHole);
            await loadData();
        } catch (error) {
            console.error("[useScoring] Error joining round:", error);
        }
    }, [roundId, currentHole, loadData]);

    const leaveRound = useCallback(async (participantId: number) => {
        try {
            await DatabaseService.updateParticipantEndHole(participantId, currentHole - 1);
            await loadData();
        } catch (error) {
            console.error("[useScoring] Error leaving round:", error);
        }
    }, [currentHole, loadData]);

    const submitScore = useCallback(async (scores: Record<string, number>, autoAdvance: boolean = true) => {
        if (!round) return;

        try {
            // 1. Save the new score for the current hole (Overwrite existing)
            await DatabaseService.deleteHoleData(roundId, currentHole);
            await DatabaseService.saveHoleResult(roundId, currentHole, scores);

            // 2. Reset ALL carryover state for this round
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
                    for (const coId of outcome.claimedCarryoverIds) {
                        await DatabaseService.markCarryoverAsWon(coId);
                    }
                    currentPool = currentPool.filter(co => !outcome.claimedCarryoverIds.includes(co.id || -1));
                } else if (outcome.type === "CarryoverCreated") {
                    if (round.useCarryovers) {
                        const newIdResult = await DatabaseService.saveCarryover(roundId, res.holeNumber, outcome.amount, outcome.eligibleNames);
                        currentPool.push({
                            id: Number(newIdResult),
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

            if (autoAdvance && currentHole < round.totalHoles) {
                setCurrentHole(prev => prev + 1);
            }
        } catch (error) {
            console.error("[useScoring] Error submitting score:", error);
        }
    }, [round, roundId, currentHole, participants, loadData]);

    const skipHole = useCallback(async () => {
        if (!round) return;
        try {
            await DatabaseService.deleteHoleData(roundId, currentHole);
            await DatabaseService.saveHoleResult(roundId, currentHole, {});

            if (currentHole < round.totalHoles) {
                setCurrentHole(prev => prev + 1);
            }
            await loadData();
        } catch (error) {
            console.error("[useScoring] Error skipping hole:", error);
        }
    }, [round, roundId, currentHole, loadData]);

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
        skipHole,
        joinRound,
        leaveRound,
        loadData
    };
};
