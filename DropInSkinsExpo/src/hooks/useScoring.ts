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
            // 1. Delete old data for this hole to allow re-scoring
            await DatabaseService.deleteHoleData(roundId, currentHole);

            // 2. Fetch ALL carryovers (including won ones) to simulate context UP TO this hole
            const allCOs = await DatabaseService.getRoundHistoryCarryovers(roundId);

            // Simulating history to find COs available AT currentHole
            let currentPool: Carryover[] = [];

            const initialCOs = allCOs.filter(c => c.originatingHole === 0);
            if (initialCOs.length > 0) {
                currentPool.push(...initialCOs);
            }

            const sortedResults = [...holeResults]
                .filter(r => r.holeNumber < currentHole)
                .sort((a, b) => a.holeNumber - b.holeNumber);

            sortedResults.forEach(res => {
                const activeParts = participants.filter(p =>
                    res.holeNumber >= p.startHole && (p.endHole === null || res.holeNumber <= p.endHole)
                );
                const outcome = engine.calculateHole(res.holeNumber, res.participantScores, activeParts, currentPool, round.betAmount);
                if (outcome.type === "Winner") {
                    currentPool = currentPool.filter(co => !outcome.claimedCarryoverIds.includes(co.id || -1));
                } else if (outcome.type === "CarryoverCreated") {
                    const dbCOs = allCOs.filter(c => c.originatingHole === res.holeNumber);
                    if (dbCOs.length > 0) currentPool.push(...dbCOs);
                }
            });

            const activeParts = participants.filter(p => {
                return currentHole >= p.startHole && (p.endHole === null || currentHole <= p.endHole);
            });

            const outcome = engine.calculateHole(
                currentHole,
                scores,
                activeParts,
                currentPool,
                round.betAmount
            );

            if (outcome.type === "Winner") {
                await DatabaseService.saveHoleResult(roundId, currentHole, scores);
                for (const coId of outcome.claimedCarryoverIds) {
                    await DatabaseService.markCarryoverAsWon(coId);
                }
            } else if (outcome.type === "CarryoverCreated") {
                await DatabaseService.saveHoleResult(roundId, currentHole, scores);
                await DatabaseService.saveCarryover(roundId, currentHole, outcome.amount, outcome.eligibleNames);
            }

            await loadData();
            if (currentHole < round.totalHoles) {
                setCurrentHole(prev => prev + 1);
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
