import React, { useState, useEffect } from "react";
import { View, Text, TextInput, Button, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, Modal, FlatList, Keyboard } from "react-native";
import { useScoring } from "../../hooks/useScoring";
import { DatabaseService } from "../../data/database";
import { Player } from "../../types";

export const ScoringScreen = ({ route, navigation }: any) => {
    const { roundId, jumpToHole } = route.params;
    const {
        currentHole,
        setCurrentHole,
        round,
        participants,
        leaderboard,
        holeResults,
        carryovers,
        loading,
        submitScore,
        joinRound,
        leaveRound
    } = useScoring(roundId);

    useEffect(() => {
        if (jumpToHole) {
            setCurrentHole(jumpToHole);
        }
    }, [jumpToHole]);
    const [scores, setScores] = useState<Record<string, string>>({});
    const [allPlayers, setAllPlayers] = useState<Player[]>([]);
    const [showManageModal, setShowManageModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        DatabaseService.getAllPlayers().then(setAllPlayers);
    }, []);

    useEffect(() => {
        if (holeResults.length > 0) {
            const hRes = holeResults.find(r => r.holeNumber === currentHole);
            if (hRes) {
                const newScores: Record<string, string> = {};
                Object.entries(hRes.participantScores).forEach(([name, score]) => {
                    newScores[name] = score.toString();
                });
                setScores(newScores);
            } else {
                setScores({});
            }
        } else {
            setScores({});
        }
    }, [currentHole, holeResults]);

    if (loading) return <ActivityIndicator size="large" style={styles.centered} />;

    const handleScoreChange = (name: string, value: string) => {
        setScores(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async () => {
        if (submitting) return;
        Keyboard.dismiss();
        setSubmitting(true);
        try {
            const numericScores: Record<string, number> = {};
            Object.entries(scores).forEach(([name, val]) => {
                const parsed = parseInt(val, 10);
                if (!isNaN(parsed) && parsed > 0) {
                    numericScores[name] = parsed;
                }
            });
            await submitScore(numericScores);
            setScores({});
        } finally {
            setSubmitting(false);
        }
    };

    const activeParticipants = participants.filter(p => {
        return currentHole >= p.startHole && (p.endHole === null || currentHole <= p.endHole);
    });

    const nonParticipants = allPlayers.filter(p =>
        !participants.some(part => part.name === p.name && (part.endHole === null))
    );

    const relevantCOs = carryovers.filter(c => c.originatingHole < currentHole && c.isWon === 0);
    const totalCarryoverCashValue = relevantCOs.reduce((sum, co) => sum + (co.amount * co.eligibleParticipantNames.length), 0);
    const currentHolePot = activeParticipants.length * (round?.betAmount || 0);
    const totalPotValue = currentHolePot + totalCarryoverCashValue;

    const outstandingSkinsCount = relevantCOs.length;
    const totalSkinsAtStake = 1 + outstandingSkinsCount;

    return (
        <View style={{ flex: 1 }}>
            <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
                <View style={styles.header}>
                    <View>
                        <Text style={styles.title}>Hole {currentHole}</Text>
                        <Text style={styles.subtitle}>{totalSkinsAtStake} Skins at stake</Text>
                        {outstandingSkinsCount > 0 && (
                            <Text style={styles.coIndicator}>{outstandingSkinsCount} Outstanding Carryover(s)</Text>
                        )}
                    </View>
                    <TouchableOpacity onPress={() => setShowManageModal(true)} style={styles.manageBtn}>
                        <Text style={{ fontSize: 24 }}>👥</Text>
                        <Text style={styles.manageBtnText}>Manage</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.tableHeader}>
                    <Text style={[styles.playerName, { flex: 2 }]}>Player</Text>
                    <Text style={[styles.columnLabel, { flex: 1 }]}>Skins</Text>
                    <Text style={[styles.columnLabel, { flex: 1.5 }]}>Net Score</Text>
                </View>

                {activeParticipants.length === 0 ? (
                    <Text style={styles.noPlayers}>No active players for this hole.</Text>
                ) : (
                    activeParticipants.map(player => (
                        <View key={player.name} style={styles.playerRow}>
                            <Text style={[styles.playerName, { flex: 2 }]}>{player.name}</Text>
                            <Text style={[styles.skinCount, { flex: 1 }]}>{leaderboard[player.name] || 0}</Text>
                            <TextInput
                                style={[styles.input, { flex: 1.5 }]}
                                keyboardType="numeric"
                                placeholder="0"
                                value={scores[player.name] || ""}
                                onChangeText={text => handleScoreChange(player.name, text)}
                            />
                        </View>
                    ))
                )}

                <View style={styles.buttonRow}>
                    <TouchableOpacity
                        style={[styles.sideBtn, styles.prevBtn]}
                        onPress={() => setCurrentHole(h => Math.max(1, h - 1))}
                    >
                        <Text style={styles.sideBtnText}>Previous</Text>
                    </TouchableOpacity>

                    {jumpToHole ? (
                        <TouchableOpacity
                            style={[styles.sideBtn, styles.nextBtn]}
                            onPress={async () => { await handleSubmit(); navigation.goBack(); }}
                        >
                            <Text style={styles.sideBtnText}>Save & Return</Text>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            style={[styles.sideBtn, styles.nextBtn, (activeParticipants.length === 0 || submitting) && styles.disabledBtn]}
                            onPress={handleSubmit}
                            disabled={activeParticipants.length === 0 || submitting}
                        >
                            {submitting ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <Text style={styles.sideBtnText}>Next Hole</Text>
                            )}
                        </TouchableOpacity>
                    )}
                </View>

                {currentHole === round?.totalHoles && !jumpToHole && !round?.isCompleted && (
                    <TouchableOpacity
                        style={[styles.finishBtn, submitting && styles.disabledBtn]}
                        disabled={submitting}
                        onPress={async () => {
                            await handleSubmit(); // Save the final hole's scores
                            await DatabaseService.completeRound(roundId);
                            navigation.navigate("Stats", { roundId });
                        }}
                    >
                        <Text style={styles.finishBtnText}>Finish and Save Round</Text>
                    </TouchableOpacity>
                )}

                {/* Early Finish Button - Available if at least one hole is scored and round is not yet finished */}
                {round && !round.isCompleted && !jumpToHole && holeResults.length > 0 && currentHole < round.totalHoles && (
                    <TouchableOpacity
                        style={[styles.finishBtn, { backgroundColor: '#FF9500' }, submitting && styles.disabledBtn]}
                        disabled={submitting}
                        onPress={async () => {
                            await handleSubmit();
                            await DatabaseService.completeRound(roundId);
                            navigation.navigate("Stats", { roundId });
                        }}
                    >
                        <Text style={styles.finishBtnText}>End Round Early</Text>
                    </TouchableOpacity>
                )}

                <TouchableOpacity
                    style={styles.statsBtn}
                    onPress={() => navigation.navigate("Stats", { roundId })}
                >
                    <Text style={styles.statsBtnText}>View Stats</Text>
                </TouchableOpacity>
            </ScrollView>

            <Modal visible={showManageModal} animationType="slide" transparent={false}>
                <View style={styles.modalContainer}>
                    <Text style={styles.modalTitle}>Manage Participants</Text>

                    <Text style={styles.sectionLabel}>Active in Round</Text>
                    {participants.filter(p => p.endHole === null).map(p => (
                        <View key={p.id} style={styles.mgmtRow}>
                            <Text style={styles.mgmtName}>{p.name}</Text>
                            <TouchableOpacity onPress={() => p.id && leaveRound(p.id)} style={styles.leaveBtn}>
                                <Text style={{ color: 'red', marginRight: 5 }}>🚪 Leave</Text>
                            </TouchableOpacity>
                        </View>
                    ))}

                    <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Available to Drop In</Text>
                    {nonParticipants.map(p => (
                        <View key={p.name} style={styles.mgmtRow}>
                            <Text style={styles.mgmtName}>{p.name}</Text>
                            <TouchableOpacity onPress={() => joinRound(p.name)} style={styles.joinBtn}>
                                <Text style={{ color: 'green', marginRight: 5 }}>➕ Join</Text>
                            </TouchableOpacity>
                        </View>
                    ))}

                    <TouchableOpacity style={styles.closeBtn} onPress={() => setShowManageModal(false)}>
                        <Text style={styles.closeBtnText}>Done</Text>
                    </TouchableOpacity>
                </View>
            </Modal>
        </View >
    );
};

const styles = StyleSheet.create({
    container: { padding: 20, backgroundColor: "#fff" },
    centered: { flex: 1, justifyContent: "center" },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    title: { fontSize: 28, fontWeight: "bold" },
    subtitle: { fontSize: 16, color: "#666" },
    coIndicator: { fontSize: 20, color: "#FF9500", fontWeight: "bold", marginTop: 4 },
    manageBtn: { alignItems: 'center' },
    manageBtnText: { color: '#007AFF', fontSize: 12 },
    tableHeader: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: '#eee', marginBottom: 5 },
    columnLabel: { fontSize: 12, color: '#999', fontWeight: 'bold', textTransform: 'uppercase' },
    playerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: "#eee" },
    playerName: { fontSize: 18, fontWeight: '500' },
    skinCount: { fontSize: 18, fontWeight: 'bold', color: '#007AFF', textAlign: 'center' },
    input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 5, padding: 8, width: 80, textAlign: "center", fontSize: 18 },
    buttonRow: { flexDirection: "row", justifyContent: "space-between", marginVertical: 30, gap: 10 },
    sideBtn: { flex: 1, padding: 15, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    prevBtn: { backgroundColor: '#8E8E93' },
    nextBtn: { backgroundColor: '#007AFF' },
    sideBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    disabledBtn: { backgroundColor: '#ccc' },
    finishBtn: { backgroundColor: '#28A745', padding: 15, borderRadius: 10, alignItems: 'center', marginBottom: 10 },
    finishBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    statsBtn: { padding: 10, alignItems: 'center' },
    statsBtnText: { color: '#007AFF', fontSize: 16, fontWeight: '500' },
    noPlayers: { textAlign: 'center', marginTop: 50, color: '#999', fontSize: 16 },
    modalContainer: { flex: 1, padding: 40, backgroundColor: '#f9f9f9' },
    modalTitle: { fontSize: 24, fontWeight: 'bold', marginBottom: 30 },
    sectionLabel: { fontSize: 14, fontWeight: '600', color: '#666', marginBottom: 10, textTransform: 'uppercase' },
    mgmtRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, backgroundColor: '#fff', borderRadius: 10, marginBottom: 10, elevation: 2 },
    mgmtName: { fontSize: 18 },
    leaveBtn: { flexDirection: 'row', alignItems: 'center' },
    joinBtn: { flexDirection: 'row', alignItems: 'center' },
    closeBtn: { marginTop: 'auto', backgroundColor: '#007AFF', padding: 15, borderRadius: 10, alignItems: 'center' },
    closeBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' }
});
