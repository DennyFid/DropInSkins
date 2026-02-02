import React, { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, TextInput, Platform } from "react-native";
import { DatabaseService } from "../../data/database";
import { Round, Participant, HoleResult, Carryover } from "../../types";
import { RoundCalculator } from "../../domain/RoundCalculator";
import { ScrollView } from "react-native";

export const HistoryScreen = ({ navigation }: any) => {
    const [rounds, setRounds] = useState<Round[]>([]);
    const [filteredRounds, setFilteredRounds] = useState<Round[]>([]);
    const [loading, setLoading] = useState(true);
    const currentYear = new Date().getFullYear();
    const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
    const [endDate, setEndDate] = useState(`${currentYear}-12-31`);
    const [viewMode, setViewMode] = useState<'rounds' | 'report'>('rounds');
    const [reportData, setReportData] = useState<{
        players: string[],
        games: { id: number, date: string, balances: Record<string, number> }[],
        totals: Record<string, number>
    } | null>(null);

    const isWeb = Platform.OS === 'web';

    useEffect(() => {
        loadRounds();
    }, []);

    useEffect(() => {
        filterRounds();
    }, [rounds, startDate, endDate]);

    useEffect(() => {
        if (viewMode === 'report') {
            generateReport();
        }
    }, [filteredRounds, viewMode]);

    const generateReport = async () => {
        setLoading(true);
        const reportGames: { id: number, date: string, balances: Record<string, number> }[] = [];
        const playerSet = new Set<string>();

        for (const round of filteredRounds) {
            const data = await DatabaseService.getFullRoundData(round.id!);
            const { balances } = RoundCalculator.calculateRoundResults(
                round,
                data.participants,
                data.holeResults,
                data.carryovers
            );

            const d = new Date(round.date);
            const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;

            reportGames.push({
                id: round.id!,
                date: dateStr,
                balances
            });

            Object.keys(balances).forEach(name => playerSet.add(name));
        }

        const sortedPlayers = Array.from(playerSet).sort();
        const totals: Record<string, number> = {};
        sortedPlayers.forEach(name => {
            totals[name] = reportGames.reduce((sum, g) => sum + (g.balances[name] || 0), 0);
        });

        setReportData({
            players: sortedPlayers,
            games: reportGames.reverse(), // Show newest first or oldest? Let's stay consistent with rounds: newest first
            totals
        });
        setLoading(false);
    };

    const loadRounds = async () => {
        setLoading(true);
        const all = await DatabaseService.getAllRounds();
        setRounds(all);
        setLoading(false);
    };

    const filterRounds = () => {
        let filtered = [...rounds];

        filtered = filtered.filter(r => {
            const d = new Date(r.date);
            const localDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

            if (startDate && localDateStr < startDate) return false;
            if (endDate && localDateStr > endDate) return false;

            return true;
        });

        setFilteredRounds(filtered);
    };

    const deleteRound = async (id: number) => {
        const confirmDelete = async () => {
            await DatabaseService.deleteRound(id);
            loadRounds();
        };

        if (isWeb) {
            if (window.confirm("Are you sure you want to delete this round? This cannot be undone.")) {
                confirmDelete();
            }
        } else {
            Alert.alert(
                "Delete Round",
                "Are you sure you want to delete this round? This cannot be undone.",
                [
                    { text: "Cancel", style: "cancel" },
                    {
                        text: "Delete",
                        style: "destructive",
                        onPress: confirmDelete
                    }
                ]
            );
        }
    };

    const formatDate = (timestamp: number) => {
        const d = new Date(timestamp);
        return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    if (loading) return <ActivityIndicator size="large" style={styles.centered} />;

    return (
        <View style={styles.container}>
            <Text style={styles.title}>All Rounds</Text>

            <View style={styles.filterSection}>
                <Text style={styles.sectionTitle}>Filter by Date</Text>
                <View style={styles.dateInputs}>
                    <TextInput
                        style={styles.dateInput}
                        placeholder="YYYY-MM-DD"
                        value={startDate}
                        onChangeText={setStartDate}
                    />
                    <Text style={styles.toText}>to</Text>
                    <TextInput
                        style={styles.dateInput}
                        placeholder="YYYY-MM-DD"
                        value={endDate}
                        onChangeText={setEndDate}
                    />
                </View>
            </View>

            {filteredRounds.length > 0 && (
                <View style={styles.summaryBar}>
                    <Text style={styles.summaryText}>
                        {filteredRounds.length} Rounds | {filteredRounds.reduce((sum, r) => sum + r.totalHoles, 0)} Holes | ${filteredRounds.reduce((sum, r) => sum + r.betAmount, 0).toFixed(2)} Stakes
                    </Text>
                </View>
            )}

            <View style={styles.viewToggle}>
                <TouchableOpacity
                    style={[styles.toggleBtn, viewMode === 'rounds' && styles.activeToggle]}
                    onPress={() => setViewMode('rounds')}
                >
                    <Text style={[styles.toggleText, viewMode === 'rounds' && styles.activeToggleText]}>Rounds</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.toggleBtn, viewMode === 'report' && styles.activeToggle]}
                    onPress={() => setViewMode('report')}
                >
                    <Text style={[styles.toggleText, viewMode === 'report' && styles.activeToggleText]}>Player Report</Text>
                </TouchableOpacity>
            </View>

            {filteredRounds.length === 0 ? (
                <View style={styles.empty}>
                    <Text style={styles.emptyText}>No rounds found for this period.</Text>
                </View>
            ) : viewMode === 'rounds' ? (
                <FlatList
                    data={filteredRounds}
                    keyExtractor={(item) => item.id!.toString()}
                    renderItem={({ item }) => (
                        <View style={styles.cardWrapper}>
                            <TouchableOpacity
                                style={styles.roundCard}
                                onPress={() => navigation.navigate("Stats", { roundId: item.id })}
                            >
                                <View style={styles.cardHeader}>
                                    <Text style={styles.date}>{formatDate(item.date)}</Text>
                                    <View style={[styles.badge, item.isCompleted ? styles.completedBadge : styles.activeBadge]}>
                                        <Text style={styles.badgeText}>{item.isCompleted ? "Finished" : "Active"}</Text>
                                    </View>
                                </View>
                                <View style={styles.cardBody}>
                                    <Text style={styles.stats}>
                                        {item.totalHoles} Holes | ${item.betAmount} Bet
                                    </Text>
                                    <Text style={styles.viewLink}>View Details →</Text>
                                </View>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.deleteBtn}
                                onPress={() => deleteRound(item.id!)}
                            >
                                <Text style={styles.deleteBtnText}>🗑️</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                />
            ) : (
                reportData && (
                    <ScrollView horizontal style={styles.reportScroll}>
                        <View style={styles.reportTable}>
                            <View style={[styles.reportRow, styles.reportHeader]}>
                                <Text style={[styles.reportCell, styles.playerColumn, styles.headerText]}>Player</Text>
                                {reportData.games.map(g => (
                                    <Text key={g.id} style={[styles.reportCell, styles.gameColumn, styles.headerText]}>{g.date}</Text>
                                ))}
                                <Text style={[styles.reportCell, styles.totalColumn, styles.headerText]}>Total</Text>
                            </View>
                            {reportData.players.map(player => (
                                <View key={player} style={styles.reportRow}>
                                    <Text style={[styles.reportCell, styles.playerColumn, styles.playerNameText]}>{player}</Text>
                                    {reportData.games.map(g => {
                                        const bal = g.balances[player];
                                        return (
                                            <Text key={g.id} style={[
                                                styles.reportCell,
                                                styles.gameColumn,
                                                bal !== undefined && { color: bal >= 0 ? '#4CD964' : '#FF3B30', fontWeight: '500' }
                                            ]}>
                                                {bal !== undefined ? (bal >= 0 ? '+' : '') + bal.toFixed(2) : '-'}
                                            </Text>
                                        );
                                    })}
                                    <Text style={[
                                        styles.reportCell,
                                        styles.totalColumn,
                                        { fontWeight: 'bold', color: reportData.totals[player] >= 0 ? '#4CD964' : '#FF3B30' }
                                    ]}>
                                        {(reportData.totals[player] >= 0 ? '+' : '') + reportData.totals[player].toFixed(2)}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    </ScrollView>
                )
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: "#f9f9f9" },
    centered: { flex: 1, justifyContent: "center" },
    title: { fontSize: 24, fontWeight: "bold", marginBottom: 20 },
    filterSection: { backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 20, elevation: 1 },
    sectionTitle: { fontSize: 14, color: '#666', marginBottom: 10, fontWeight: '600' },
    dateInputs: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    dateInput: { flex: 1, borderWidth: 1, borderColor: '#eee', padding: 8, borderRadius: 6, fontSize: 14 },
    toText: { color: '#999' },
    cardWrapper: { flexDirection: 'row', alignItems: 'center', marginBottom: 15, gap: 10 },
    roundCard: { flex: 1, backgroundColor: "#fff", padding: 15, borderRadius: 12, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
    deleteBtn: { backgroundColor: '#FFEBEE', padding: 15, borderRadius: 12, justifyContent: 'center' },
    deleteBtnText: { fontSize: 18 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    date: { fontSize: 16, fontWeight: '600' },
    badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5 },
    activeBadge: { backgroundColor: '#E3F2FD' },
    completedBadge: { backgroundColor: '#F5F5F5' },
    badgeText: { fontSize: 10, fontWeight: 'bold', color: '#1976D2', textTransform: 'uppercase' },
    cardBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
    stats: { color: '#666' },
    viewLink: { color: '#1976D2', fontWeight: '500' },
    empty: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 50 },
    emptyText: { color: '#999', fontSize: 16 },
    summaryBar: { backgroundColor: '#E8F5E9', padding: 12, borderRadius: 8, marginBottom: 20, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: '#81C784' },
    summaryText: { color: '#2E7D32', fontWeight: 'bold', fontSize: 14 },
    viewToggle: { flexDirection: 'row', backgroundColor: '#eee', borderRadius: 8, padding: 4, marginBottom: 20 },
    toggleBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
    activeToggle: { backgroundColor: '#fff', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
    toggleText: { color: '#666', fontWeight: '600' },
    activeToggleText: { color: '#000' },
    reportScroll: { backgroundColor: '#fff', borderRadius: 12, elevation: 1 },
    reportTable: { padding: 10 },
    reportRow: { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', alignItems: 'center' },
    reportHeader: { borderBottomWidth: 2, borderBottomColor: '#eee' },
    reportCell: { textAlign: 'center', paddingHorizontal: 5 },
    playerColumn: { width: 100, textAlign: 'left', fontWeight: '600' },
    gameColumn: { width: 80 },
    totalColumn: { width: 100, fontWeight: 'bold' },
    headerText: { fontSize: 12, color: '#999', textTransform: 'uppercase', fontWeight: 'bold' },
    playerNameText: { fontSize: 15 }
});
