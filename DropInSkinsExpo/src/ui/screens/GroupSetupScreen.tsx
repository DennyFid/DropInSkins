import React, { useState, useEffect } from "react";
import { View, Text, TextInput, Button, FlatList, StyleSheet, Alert, TouchableOpacity } from "react-native";
import { DatabaseService } from "../../data/database";
import { Player } from "../../types";

export const GroupSetupScreen = ({ navigation }: any) => {
    const [playerName, setPlayerName] = useState("");
    const [players, setPlayers] = useState<Player[]>([]);
    const [pendingCO, setPendingCO] = useState<number | null>(null);

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
                const total = cos.reduce((sum, c) => sum + c.amount, 0);
                setPendingCO(total);
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
                        💰 ${pendingCO.toFixed(2)} pending carryover from last round!
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

            <Button
                title="Next: Round Setup"
                onPress={() => navigation.navigate("RoundSetup")}
                disabled={players.length < 1}
            />

            <TouchableOpacity
                style={styles.historyBtn}
                onPress={() => navigation.navigate("History")}
            >
                <Text style={styles.historyBtnText}>View Past Rounds</Text>
            </TouchableOpacity>
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
    historyBtn: { marginTop: 15, padding: 10, alignItems: 'center' },
    historyBtnText: { color: '#007AFF', fontSize: 16, fontWeight: '500' }
});
