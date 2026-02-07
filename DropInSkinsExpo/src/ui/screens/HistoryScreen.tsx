import React, { useEffect, useState, useCallback } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, TextInput, Platform, Modal } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { DatabaseService } from "../../data/database";
import { Round, Participant, HoleResult, Carryover } from "../../types";
import { RoundCalculator } from "../../domain/RoundCalculator";
import { ReportService } from "../../services/ReportService";
import { DataManagementService } from "../../services/DataManagementService";

export const HistoryScreen = ({ navigation }: any) => {
    const [rounds, setRounds] = useState<Round[]>([]);
    const [filteredRounds, setFilteredRounds] = useState<Round[]>([]);
    const [loading, setLoading] = useState(true);
    const [exportLoading, setExportLoading] = useState(false);
    const [backupFiles, setBackupFiles] = useState<{ uri: string, name: string }[]>([]);
    const [showRestoreModal, setShowRestoreModal] = useState(false);

    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(now.getDate() - 30);

    const formatForDisplay = (d: Date) => {
        return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
    };

    const [startDate, setStartDate] = useState(formatForDisplay(thirtyDaysAgo));
    const [endDate, setEndDate] = useState(formatForDisplay(now));
    const [viewMode, setViewMode] = useState<'rounds' | 'report'>('rounds');
    const [reportData, setReportData] = useState<{
        players: string[],
        games: { id: number, date: string, balances: Record<string, number> }[],
        totals: Record<string, number>,
        totalWinnings: Record<string, number>
    } | null>(null);

    const isWeb = Platform.OS === 'web';

    useEffect(() => {
        loadRounds();
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadRounds();
        }, [])
    );

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
        try {
            const reportGames: { id: number, date: string, balances: Record<string, number> }[] = [];
            const playerSet = new Set<string>();
            const totalWinnings: Record<string, number> = {};
            const totals: Record<string, number> = {};

            for (const round of filteredRounds) {
                const data = await DatabaseService.getFullRoundData(round.id!);
                const { balances, grossWinnings } = RoundCalculator.calculateRoundResults(
                    round,
                    data.participants,
                    data.holeResults,
                    data.carryovers
                );

                const d = new Date(round.date);
                const dateStr = formatForDisplay(d);

                reportGames.push({
                    id: round.id!,
                    date: dateStr,
                    balances
                });

                // Accumulate winnings
                if (grossWinnings) {
                    Object.entries(grossWinnings).forEach(([name, won]) => {
                        totalWinnings[name] = (totalWinnings[name] || 0) + won;
                    });
                }

                Object.keys(balances).forEach(name => playerSet.add(name));
            }

            const sortedPlayers = Array.from(playerSet).sort();

            sortedPlayers.forEach(name => {
                totals[name] = reportGames.reduce((sum, g) => sum + (g.balances[name] || 0), 0);
            });

            setReportData({
                players: sortedPlayers,
                games: reportGames.reverse(),
                totals,
                totalWinnings
            });
        } catch (error) {
            console.error("[HistoryScreen] Error generating report:", error);
        } finally {
            setLoading(false);
        }
    };

    const loadRounds = async () => {
        setLoading(true);
        try {
            const all = await DatabaseService.getAllRounds();
            setRounds(all);
        } catch (error) {
            console.error("[HistoryScreen] Error loading rounds:", error);
        } finally {
            setLoading(false);
        }
    };

    const parseDate = (str: string) => {
        if (!str) return null;
        // Parse m[m]/d[d]/yy[yy] or m[m]-d[d]-yy[yy]
        const parts = str.split(/[-/]/);
        if (parts.length !== 3) return null;
        let [m, d, y] = parts.map(p => parseInt(p, 10));
        if (isNaN(m) || isNaN(d) || isNaN(y)) return null;

        // Handle 2-digit years (assume 20xx)
        if (y < 100) y += 2000;

        const date = new Date(y, m - 1, d);
        return isNaN(date.getTime()) ? null : date;
    };

    const filterRounds = () => {
        let filtered = [...rounds];
        const start = parseDate(startDate);
        const end = parseDate(endDate);

        // Adjust end date to end of day if it exists
        if (end) {
            end.setHours(23, 59, 59, 999);
        }

        filtered = filtered.filter(r => {
            const rd = new Date(r.date);
            if (start && rd < start) return false;
            if (end && rd > end) return false;
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
        const datePart = formatForDisplay(d);
        const timePart = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `${datePart} ${timePart}`;
    };

    const handleBackup = async () => {
        setExportLoading(true);
        try {
            await DataManagementService.backupData();
        } finally {
            setExportLoading(false);
        }
    };

    const handleRestore = async () => {
        if (!isWeb) {
            const files = await DataManagementService.getBackupFiles();
            if (files && files.length > 0) {
                setBackupFiles(files);
                setShowRestoreModal(true);
            } else {
                // Fallback to system picker if no directory set or no files
                performSystemRestore();
            }
        } else {
            // Web simplistic confirmation
            if (confirm("Restore will OVERWRITE all data. Proceed?")) {
                const success = await DataManagementService.restoreData();
                if (success) loadRounds();
            }
        }
    };

    const performSystemRestore = async (uri?: string) => {
        Alert.alert(
            "Confirm Restore",
            "This will OVERWRITE all current data with the selected backup. This cannot be undone.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Proceed",
                    style: "destructive",
                    onPress: async () => {
                        setLoading(true);
                        const success = await DataManagementService.restoreData(uri);
                        if (success) {
                            alert("Restore successful! Reloading data...");
                            loadRounds();
                        }
                        setLoading(false);
                        setShowRestoreModal(false);
                    }
                }
            ]
        );
    };

    if (loading) return <ActivityIndicator size="large" style={styles.centered} />;

    return (
        <View style={styles.container}>
            <View style={styles.headerRow}>
                <Text style={styles.title}>All Rounds</Text>
                <View style={{ flexDirection: 'column', gap: 5 }}>
                    <TouchableOpacity
                        style={[styles.shareBtn, exportLoading && styles.disabledShareBtn]}
                        onPress={async () => {
                            setExportLoading(true);
                            await ReportService.generateAndShareReport();
                            setExportLoading(false);
                        }}
                        disabled={exportLoading}
                    >
                        <Text style={styles.shareBtnText}>📄 Text</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.shareBtn, { borderColor: '#34C759' }, exportLoading && styles.disabledShareBtn]}
                        onPress={async () => {
                            setExportLoading(true);
                            await ReportService.generateAndShareCSV();
                            setExportLoading(false);
                        }}
                        disabled={exportLoading}
                    >
                        <Text style={[styles.shareBtnText, { color: '#34C759' }]}>📊 CSV</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.shareBtn}
                        onPress={() => navigation.popToTop()}
                    >
                        <Text style={styles.shareBtnText}>🏠 Home</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.manageRow}>
                <TouchableOpacity
                    style={styles.backupBtn}
                    onPress={handleBackup}
                    disabled={exportLoading}
                >
                    <Text style={styles.backupBtnText}>💾 Backup</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.restoreBtn}
                    onPress={handleRestore}
                    disabled={exportLoading}
                >
                    <Text style={styles.restoreBtnText}>🔄 Restore</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.filterSection}>
                <Text style={styles.sectionTitle}>Filter by Date</Text>
                <View style={styles.dateInputs}>
                    <TextInput
                        style={styles.dateInput}
                        placeholder="MM/DD/YYYY"
                        value={startDate}
                        onChangeText={setStartDate}
                    />
                    <Text style={styles.toText}>to</Text>
                    <TextInput
                        style={styles.dateInput}
                        placeholder="MM/DD/YYYY"
                        value={endDate}
                        onChangeText={setEndDate}
                    />
                </View>
            </View>

            {filteredRounds.length > 0 && (
                <View style={styles.summaryBar}>
                    <Text style={styles.summaryText}>
                        {filteredRounds.length} Rounds | {filteredRounds.reduce((sum, r) => sum + r.totalHoles, 0)} Holes Scheduled | ${filteredRounds.reduce((sum, r) => sum + r.betAmount, 0).toFixed(2)} Base Stakes
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
                                        {item.totalHoles} Holes Planned | ${item.betAmount} Bet
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
                                <Text style={[styles.reportCell, styles.totalColumn, styles.headerText]}>Total Won</Text>
                                <Text style={[styles.reportCell, styles.totalColumn, styles.headerText]}>Net Total</Text>
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
                                        { fontWeight: 'bold', color: '#4CD964' }
                                    ]}>
                                        {reportData.totalWinnings[player] ? `+$${reportData.totalWinnings[player].toFixed(2)}` : '-'}
                                    </Text>
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

            <Modal visible={showRestoreModal} animationType="slide" transparent={true}>
                <View style={styles.modalOverlay}>
                    <View style={styles.pickerModalContent}>
                        <Text style={styles.modalTitle}>Select Backup</Text>
                        <Text style={styles.modalSubtitle}>Found in your backup folder</Text>

                        <FlatList
                            data={backupFiles}
                            keyExtractor={item => item.uri}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={styles.fileItem}
                                    onPress={() => performSystemRestore(item.uri)}
                                >
                                    <Text style={styles.fileName}>{item.name}</Text>
                                </TouchableOpacity>
                            )}
                            ListFooterComponent={
                                <TouchableOpacity
                                    style={[styles.fileItem, { borderBottomWidth: 0, marginTop: 10 }]}
                                    onPress={() => { setShowRestoreModal(false); performSystemRestore(); }}
                                >
                                    <Text style={[styles.fileName, { color: '#007AFF', fontWeight: 'bold' }]}>📁 Browse Other...</Text>
                                </TouchableOpacity>
                            }
                        />

                        <TouchableOpacity style={styles.cancelModalBtn} onPress={() => setShowRestoreModal(false)}>
                            <Text style={styles.cancelModalBtnText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: "#f9f9f9" },
    centered: { flex: 1, justifyContent: "center" },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    title: { fontSize: 32, fontWeight: "bold", textAlign: 'center', flex: 1 },
    shareBtn: { padding: 10, backgroundColor: '#fff', borderRadius: 8, elevation: 1, borderWidth: 1, borderColor: '#eee' },
    shareBtnText: { color: '#007AFF', fontWeight: 'bold' },
    disabledShareBtn: { opacity: 0.5 },
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
    playerNameText: { fontSize: 15 },
    manageRow: { flexDirection: 'row', gap: 10, marginBottom: 15, justifyContent: 'flex-end' },
    backupBtn: { backgroundColor: '#F0F4C3', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#CDDC39' },
    backupBtnText: { color: '#827717', fontWeight: 'bold', fontSize: 12 },
    restoreBtn: { backgroundColor: '#FFE0B2', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#FF9800' },
    restoreBtnText: { color: '#E65100', fontWeight: 'bold', fontSize: 12 },

    // Recovery Modal Styles
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    pickerModalContent: { backgroundColor: '#fff', borderRadius: 20, padding: 20, width: '100%', maxHeight: '80%' },
    modalTitle: { fontSize: 24, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
    modalSubtitle: { fontSize: 14, color: '#666', marginBottom: 20, textAlign: 'center' },
    fileItem: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
    fileName: { fontSize: 16, color: '#333' },
    cancelModalBtn: { marginTop: 20, padding: 15, borderRadius: 10, alignItems: 'center', backgroundColor: '#eee' },
    cancelModalBtnText: { fontSize: 16, fontWeight: 'bold', color: '#666' }
});
