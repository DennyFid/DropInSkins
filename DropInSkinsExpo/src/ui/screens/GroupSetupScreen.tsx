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
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
    const [editName, setEditName] = useState("");
    const [editPhone, setEditPhone] = useState("");
    const [editEmail, setEditEmail] = useState("");

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

    const handleEditPlayer = (player: Player) => {
        setEditingPlayer(player);
        setEditName(player.name);
        setEditPhone(player.phone || "");
        setEditEmail(player.email || "");
        setEditModalVisible(true);
    };

    const handleSaveEdit = async () => {
        if (!editingPlayer || !editName.trim()) return;

        const trimmedName = editName.trim();
        if (players.some(p => p.id !== editingPlayer.id && p.name.toLowerCase() === trimmedName.toLowerCase())) {
            Alert.alert("Error", "Player name must be unique");
            return;
        }

        await DatabaseService.updatePlayer(editingPlayer.id!, trimmedName, editPhone.trim(), editEmail.trim());
        setEditModalVisible(false);
        setEditingPlayer(null);
        loadData();
    };

    const handleDeletePlayer = async (player: Player) => {
        const hasHistory = await DatabaseService.isPlayerReferenced(player.name);
        if (hasHistory) {
            Alert.alert(
                "Cannot Delete",
                `${player.name} has history in past rounds and cannot be deleted.`
            );
            return;
        }

        Alert.alert(
            "Delete Player",
            `Are you sure you want to delete ${player.name}?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        await DatabaseService.deletePlayer(player.id!);
                        loadData();
                    }
                }
            ]
        );
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
                        <View style={styles.playerActions}>
                            <TouchableOpacity onPress={() => handleEditPlayer(item)} style={styles.actionBtn}>
                                <Text style={styles.actionEmoji}>✏️</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => handleDeletePlayer(item)} style={styles.actionBtn}>
                                <Text style={styles.actionEmoji}>🗑️</Text>
                            </TouchableOpacity>
                        </View>
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
                                Note: You must enter a score or use "Skip" to move forward; the app will stay on the "Live Scoring" screen until the round is finished.
                            </Text>
                        </View>

                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>🔄 Carryovers</Text>
                            <Text style={styles.sectionBody}>
                                If a hole is tied, the skin (and its value) carries over.
                                To win a carried skin, you must have been playing on ALL holes in the carry chain (from the original tie until the win).
                            </Text>
                        </View>

                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>💰 Scoring & Payouts</Text>
                            <Text style={styles.sectionBody}>
                                "Classic Skins": Each skin is worth 1 Bet Unit from every other player who played that hole.
                                Winners collect from losers. Carryovers accumulate and are paid out when won.
                            </Text>
                        </View>

                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>🚪 Drop In & Out</Text>
                            <Text style={styles.sectionBody}>
                                Use the "Manage" button to add or remove players.
                                If you leave, you still owe for any skins you played that are won later (as carryovers).
                            </Text>
                        </View>

                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>⚖️ Round Completion</Text>
                            <Text style={styles.sectionBody}>
                                Unsettled skins are saved and can be carried into the next round!
                            </Text>
                        </View>

                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>⏭️ Skipping & Reporting</Text>
                            <Text style={styles.sectionBody}>
                                Use "Skip Hole" to bypass a hole without any skins being deducted from players.
                                Tap "Share Report" on the Summary or History screens to export a CSV or summary of the games played.
                            </Text>
                        </View>

                        <TouchableOpacity style={styles.closeBtn} onPress={() => setShowHelp(false)}>
                            <Text style={styles.closeBtnText}>Got it!</Text>
                        </TouchableOpacity>

                        <Text style={styles.versionText}>
                            Version {Constants.expoConfig?.version || "2.0.0"}
                        </Text>
                    </ScrollView>
                </View>
            </Modal>

            <Modal visible={editModalVisible} animationType="fade" transparent={true}>
                <View style={styles.overlay}>
                    <View style={styles.editModal}>
                        <Text style={styles.editTitle}>Edit Player Details</Text>
                        <TextInput
                            style={styles.editInput}
                            value={editName}
                            onChangeText={setEditName}
                            placeholder="Name"
                            autoFocus={true}
                            selectTextOnFocus={true}
                        />
                        <TextInput
                            style={styles.editInput}
                            value={editPhone}
                            onChangeText={setEditPhone}
                            placeholder="Phone (optional)"
                            keyboardType="phone-pad"
                        />
                        <TextInput
                            style={styles.editInput}
                            value={editEmail}
                            onChangeText={setEditEmail}
                            placeholder="Email (optional)"
                            keyboardType="email-address"
                            autoCapitalize="none"
                        />
                        <View style={styles.editActions}>
                            <TouchableOpacity
                                style={[styles.editBtn, styles.cancelBtn]}
                                onPress={() => setEditModalVisible(false)}
                            >
                                <Text style={styles.editBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.editBtn, styles.saveBtn]}
                                onPress={handleSaveEdit}
                            >
                                <Text style={styles.editBtnText}>Save</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: "#fff" },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    title: { fontSize: 32, fontWeight: "bold", textAlign: 'center', flex: 1 },
    historyLinkHeader: { color: '#007AFF', fontSize: 16, fontWeight: '600' },
    coBanner: { backgroundColor: '#FFF9C4', padding: 15, borderRadius: 10, marginBottom: 20, borderLeftWidth: 5, borderLeftColor: '#FBC02D' },
    coBannerText: { color: '#7B5E00', fontWeight: 'bold', fontSize: 16 },
    inputContainer: { flexDirection: "row", marginBottom: 20 },
    input: { flex: 1, borderWidth: 1, borderColor: "#ccc", borderRadius: 5, padding: 10, marginRight: 10 },
    list: { flex: 1, marginBottom: 20 },
    playerRow: {
        padding: 15,
        borderBottomWidth: 1,
        borderBottomColor: "#eee",
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    playerName: { fontSize: 18, flex: 1 },
    playerActions: { flexDirection: 'row' },
    actionBtn: { marginLeft: 15, padding: 5 },
    actionEmoji: { fontSize: 20 },
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
    versionText: { marginTop: 30, textAlign: 'center', color: '#999', fontSize: 12, marginBottom: 20 },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    editModal: { backgroundColor: '#fff', padding: 20, borderRadius: 15, width: '80%', elevation: 5 },
    editTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
    editInput: { borderWidth: 1, borderColor: '#ccc', borderRadius: 5, padding: 10, marginBottom: 20, fontSize: 18 },
    editActions: { flexDirection: 'row', justifyContent: 'space-between' },
    editBtn: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center', marginHorizontal: 5 },
    cancelBtn: { backgroundColor: '#FF3B30' },
    saveBtn: { backgroundColor: '#007AFF' },
    editBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});
