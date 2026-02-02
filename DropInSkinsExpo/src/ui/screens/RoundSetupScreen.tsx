import React, { useState, useEffect } from "react";
import { View, Text, TextInput, Button, StyleSheet, FlatList, TouchableOpacity } from "react-native";
import { DatabaseService } from "../../data/database";
import { Player, Carryover } from "../../types";

export const RoundSetupScreen = ({ navigation }: any) => {
    const [holes, setHoles] = useState("9");
    const [bet, setBet] = useState("0.01");
    const [useCarryovers, setUseCarryovers] = useState(true);
    const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);
    const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<number>>(new Set());
    const [lastRoundCOs, setLastRoundCOs] = useState<Carryover[]>([]);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        const players = await DatabaseService.getAllPlayers();
        setAvailablePlayers(players);

        // Check for defaults and carryovers from last round
        const rounds = await DatabaseService.getAllRounds();
        const lastRound = rounds[0];

        if (lastRound && lastRound.id) {
            setHoles(String(lastRound.totalHoles));
            setBet(String(lastRound.betAmount));
            setUseCarryovers(lastRound.useCarryovers !== undefined ? lastRound.useCarryovers : true);
            const cos = await DatabaseService.getCarryovers(lastRound.id);
            if (cos.length > 0) {
                setLastRoundCOs(cos);
            }
        }
    };

    const togglePlayerSelection = (id: number) => {
        setSelectedPlayerIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    };

    const handleStart = async () => {
        const roundId = await DatabaseService.createRound(
            parseInt(holes, 10),
            parseFloat(bet),
            useCarryovers
        );

        // Inherit carryovers - save them individually as Hole 0 COs for the new round
        // ONLY if carryovers are enabled
        if (useCarryovers) {
            for (const co of lastRoundCOs) {
                await DatabaseService.saveCarryover(
                    Number(roundId),
                    0,
                    co.amount,
                    co.eligibleParticipantNames
                );
            }
        }

        // Add selected players as participants starting on hole 1
        for (const id of selectedPlayerIds) {
            const player = availablePlayers.find(p => p.id === id);
            if (player) {
                await DatabaseService.addParticipant(Number(roundId), player.name, 1);
            }
        }

        navigation.navigate("Scoring", { roundId });
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Round Setup</Text>

            <View style={styles.row}>
                <View style={styles.flex1}>
                    <Text style={styles.label}>Holes</Text>
                    <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={holes}
                        onChangeText={setHoles}
                    />
                </View>
                <View style={styles.flex1}>
                    <Text style={styles.label}>Bet ($)</Text>
                    <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={bet}
                        onChangeText={setBet}
                    />
                </View>
            </View>

            {lastRoundCOs.length > 0 && (
                <View style={styles.coInfo}>
                    <Text style={styles.coText}>
                        💱 {lastRoundCOs.length} Carryover Skins from previous round!
                    </Text>
                </View>
            )}

            <Text style={styles.label}>Select Starting Players</Text>
            <FlatList
                data={availablePlayers}
                keyExtractor={(item) => item.id?.toString() || item.name}
                renderItem={({ item }) => (
                    <TouchableOpacity
                        style={[
                            styles.playerItem,
                            (item.id !== undefined && selectedPlayerIds.has(item.id)) ? styles.selectedPlayerItem : undefined
                        ]}
                        onPress={() => item.id !== undefined && togglePlayerSelection(item.id)}
                    >
                        <Text style={[
                            styles.playerName,
                            (item.id !== undefined && selectedPlayerIds.has(item.id)) ? styles.selectedPlayerName : undefined
                        ]}>
                            {item.name}
                        </Text>
                    </TouchableOpacity>
                )}
                style={styles.list}
            />

            <TouchableOpacity
                style={[styles.mainBtn, selectedPlayerIds.size === 0 && styles.disabledBtn]}
                onPress={handleStart}
                disabled={selectedPlayerIds.size === 0}
            >
                <Text style={styles.mainBtnText}>Start Round</Text>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: "#fff" },
    title: { fontSize: 24, fontWeight: "bold", marginBottom: 20 },
    label: { fontSize: 16, marginBottom: 5, fontWeight: "600" },
    input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 5, padding: 10, marginBottom: 20 },
    row: { flexDirection: "row", gap: 10 },
    switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20, backgroundColor: '#f9f9f9', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#eee' },
    toggleBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
    toggleOn: { backgroundColor: '#4CD964', borderColor: '#4CD964' },
    toggleOff: { backgroundColor: '#fff', borderColor: '#ccc' },
    toggleText: { fontWeight: 'bold', fontSize: 14 },
    toggleTextOn: { color: '#fff' },
    toggleTextOff: { color: '#999' },
    flex1: { flex: 1 },
    list: { flex: 1, marginVertical: 10 },
    playerItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: "#eee" },
    selectedPlayerItem: { backgroundColor: "#007AFF" },
    playerName: { fontSize: 18 },
    selectedPlayerName: { color: "#fff", fontWeight: "bold" },
    mainBtn: { backgroundColor: '#007AFF', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10 },
    mainBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    disabledBtn: { backgroundColor: '#ccc' },
    coInfo: { backgroundColor: '#FFF9C4', padding: 10, borderRadius: 8, marginBottom: 20, borderLeftWidth: 4, borderLeftColor: '#FBC02D' },
    coText: { color: '#7B5E00', fontWeight: 'bold', fontSize: 14 }
});
