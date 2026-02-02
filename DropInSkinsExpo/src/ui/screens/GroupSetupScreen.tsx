import React, { useState, useEffect } from "react";
import { View, Text, TextInput, Button, FlatList, StyleSheet, Alert, TouchableOpacity, Modal, ScrollView } from "react-native";
import Constants from "expo-constants";
import { DatabaseService } from "../../data/database";
import { Player } from "../../types";

export const GroupSetupScreen = ({ navigation }: any) => {
    const [playerName, setPlayerName] = useState("");
    const [players, setPlayers] = useState<Player[]>([]);
    const [pendingCO, setPendingCO] = useState<{ amount: number, count: number } | null>(null);
    const [showHelp, setShowHelp] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        const all = await DatabaseService.getAllPlayers();
        setPlayers(all);

        // Check for carryovers from the most recent round
        const rounds = await DatabaseService.getAllRounds();
        if (rounds.length > 0) {
            const cos = await DatabaseService.getCarryovers(rounds[0].id!);
            if (cos.length > 0) {
                const total = cos.reduce((sum, c) => sum + (c.amount * c.eligibleParticipantNames.length), 0);
                setPendingCO({ amount: total, count: cos.length });
            }
        }
    };

    const handleAddPlayer = async () => {
        if (!playerName.trim()) return;
        if (players.some(p => p.name.toLowerCase() === playerName.trim().toLowerCase())) {
            Alert.alert("Error", "Player name must be unique");
            return;
        }

        await DatabaseService.addPlayer(playerName.trim());
        setPlayerName("");
        loadData();
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Group Setup</Text>
                <TouchableOpacity onPress={() => navigation.navigate("History")}>
                    <Text style={styles.historyLinkHeader}>History 📜</Text>
                </TouchableOpacity>
            </View>

            {pendingCO !== null && (
                <View style={styles.coBanner}>
                    <Text style={styles.coBannerText}>
                        💰 {pendingCO.count} Pending Skins from last round!
                    </Text>
                </View>
            )}

            <View style={styles.inputContainer}>
                <TextInput
                    style={styles.input}
                    placeholder="Enter player name"
                    value={playerName}
                    onChangeText={setPlayerName}
                />
                <Button title="Add" onPress={handleAddPlayer} />
            </View>

            <FlatList
                data={players}
                keyExtractor={(item) => item.id?.toString() || item.name}
                renderItem={({ item }) => (
                    <View style={styles.playerRow}>
                        <Text style={styles.playerName}>{item.name}</Text>
                    </View>
                )}
                style={styles.list}
            />

            <TouchableOpacity
                style={[styles.mainBtn, players.length < 1 && styles.disabledBtn]}
                onPress={() => navigation.navigate("RoundSetup")}
                disabled={players.length < 1}
            >
                <Text style={styles.mainBtnText}>Next: Round Setup</Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={styles.historyBtn}
                onPress={() => navigation.navigate("History")}
            >
                <Text style={styles.historyBtnText}>View Past Rounds</Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={styles.helpBtn}
                onPress={() => setShowHelp(true)}
            >
                <Text style={styles.helpBtnText}>❔ App Help & Rules</Text>
            </TouchableOpacity>

            <Modal visible={showHelp} animationType="slide">
                <View style={styles.modalContainer}>
                    <ScrollView contentContainerStyle={styles.modalContent}>
                        <Text style={styles.modalTitle}>Drop-In Skins Rules</Text>

                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>🎯 The Basics</Text>
                            <Text style={styles.sectionBody}>
                                Drop-In Skins is a flexible scoring app for Skins golf. Each hole is worth 1 "Skin" (or stake).
                                The player with the lowest score on a hole wins the skin.
                            </Text>
                        </View>

                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>🔄 Carryovers</Text>
                            <Text style={styles.sectionBody}>
                                If the lowest score is tied between two or more players, the skin carries over to the next hole.
                                Accumulated skins are won by the next single winner of a hole.
                            </Text>
                        </View>

                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>🚪 Drop In & Out</Text>
                            <Text style={styles.sectionBody}>
                                Use the "Manage" button during a round to add or remove players.
                                Players only pay for and win skins for the holes they actually play.
                            </Text>
                        </View>

                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>⚖️ Round Completion</Text>
                            <Text style={styles.sectionBody}>
                                If a round ends with unsettled skins (ties), they are "inherited" by the next round if you start it immediately.
                                If you "End Round Early," unsettled skins are refunded to ensure balances always sum to zero.
                            </Text>
                        </View>

                        <TouchableOpacity style={styles.closeBtn} onPress={() => setShowHelp(false)}>
                            <Text style={styles.closeBtnText}>Got it!</Text>
                        </TouchableOpacity>

                        <Text style={styles.versionText}>
                            Version {Constants.expoConfig?.version || "1.0.1"}
                        </Text>
                    </ScrollView>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: "#fff" },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    title: { fontSize: 24, fontWeight: "bold" },
    historyLinkHeader: { color: '#007AFF', fontSize: 16, fontWeight: '600' },
    coBanner: { backgroundColor: '#FFF9C4', padding: 15, borderRadius: 10, marginBottom: 20, borderLeftWidth: 5, borderLeftColor: '#FBC02D' },
    coBannerText: { color: '#7B5E00', fontWeight: 'bold', fontSize: 16 },
    inputContainer: { flexDirection: "row", marginBottom: 20 },
    input: { flex: 1, borderWidth: 1, borderColor: "#ccc", borderRadius: 5, padding: 10, marginRight: 10 },
    list: { flex: 1, marginBottom: 20 },
    playerRow: { padding: 15, borderBottomWidth: 1, borderBottomColor: "#eee" },
    playerName: { fontSize: 18 },
    mainBtn: { backgroundColor: '#007AFF', padding: 15, borderRadius: 10, alignItems: 'center' },
    mainBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    disabledBtn: { backgroundColor: '#ccc' },
    historyBtn: { backgroundColor: '#007AFF', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10 },
    historyBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    helpBtn: { marginTop: 20, padding: 10, alignItems: 'center' },
    helpBtnText: { color: '#666', fontSize: 16, fontWeight: '500' },
    modalContainer: { flex: 1, backgroundColor: '#f9f9f9', padding: 20 },
    modalContent: { paddingVertical: 20 },
    modalTitle: { fontSize: 26, fontWeight: 'bold', marginBottom: 25, textAlign: 'center' },
    section: { marginBottom: 20, backgroundColor: '#fff', padding: 15, borderRadius: 10, elevation: 1 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 8, color: '#333' },
    sectionBody: { fontSize: 15, color: '#666', lineHeight: 22 },
    closeBtn: { marginTop: 20, backgroundColor: '#007AFF', padding: 15, borderRadius: 10, alignItems: 'center' },
    closeBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    versionText: { marginTop: 30, textAlign: 'center', color: '#999', fontSize: 12, marginBottom: 20 }
});
