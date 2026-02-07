import React, { useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, FlatList, TouchableOpacity } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useScoring } from "../../hooks/useScoring";
import { ReportService } from "../../services/ReportService";
import { useState } from "react";
import { DatabaseService } from "../../data/database";

export const StatsScreen = ({ route, navigation }: any) => {
    const { roundId } = route.params;
    const { round, participants, leaderboard, balances, grossWinnings, holeResults, loading, loadData } = useScoring(roundId);
    const [exportLoading, setExportLoading] = useState(false);

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [loadData])
    );

    if (loading) return <ActivityIndicator size="large" style={styles.centered} />;

    // Calculate detailed stats
    const stats = participants.map(p => {
        const skinsWon = leaderboard[p.name] || 0;
        const netReturn = balances[p.name] || 0;
        const winnings = grossWinnings ? (grossWinnings[p.name] || 0) : 0;

        // Holes played count logic...
        const lastScoredHole = Math.max(0, ...holeResults.map(r => r.holeNumber));
        const endHole = p.endHole || lastScoredHole;

        let holesCount = 0;
        for (let h = p.startHole; h <= endHole; h++) {
            const result = holeResults.find(r => r.holeNumber === h);
            if (result && Object.values(result.participantScores).some(s => s > 0)) {
                holesCount++;
            }
        }

        return {
            name: p.name,
            skinsWon,
            holesPlayed: holesCount,
            netReturn,
            winnings
        };
    });

    return (
        <ScrollView style={styles.container}>
            {/* ... header ... */}
            <View style={styles.headerRow}>
                <View>
                    <Text style={styles.title}>Round Summary</Text>
                    <Text style={styles.subtitle}>
                        {holeResults.length} Holes Played | Bet: ${round?.betAmount} per skin
                    </Text>
                </View>
                {!round?.isCompleted && (
                    <TouchableOpacity style={[styles.historyBtn, { backgroundColor: '#E3F2FD', borderColor: '#2196F3' }]} onPress={() => navigation.goBack()}>
                        <Text style={[styles.historyBtnText, { color: '#2196F3' }]}>← Scoring</Text>
                    </TouchableOpacity>
                )}
            </View>

            <View style={styles.exportRow}>
                <TouchableOpacity
                    style={[styles.exportBtn, exportLoading && { opacity: 0.5 }]}
                    onPress={async () => {
                        setExportLoading(true);
                        await ReportService.generateAndShareReport();
                        setExportLoading(false);
                    }}
                    disabled={exportLoading}
                >
                    <Text style={styles.exportBtnText}>📄 Text Report</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.exportBtn, { backgroundColor: '#34C759' }, exportLoading && { opacity: 0.5 }]}
                    onPress={async () => {
                        setExportLoading(true);
                        await ReportService.generateAndShareCSV();
                        setExportLoading(false);
                    }}
                    disabled={exportLoading}
                >
                    <Text style={styles.exportBtnText}>📊 CSV Export</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.table}>
                <View style={styles.tableHeader}>
                    <Text style={[styles.cell, styles.headerCell, { flex: 2 }]}>Player</Text>
                    <Text style={[styles.cell, styles.headerCell]}>Skins</Text>
                    <Text style={[styles.cell, styles.headerCell]}>Holes</Text>
                    <Text style={[styles.cell, styles.headerCell, { flex: 2 }]}>Winnings</Text>
                </View>

                {stats.map((row, index) => (
                    <View key={index} style={[styles.tableRow, index % 2 === 1 && styles.alternateRow]}>
                        <Text style={[styles.cell, { flex: 2, fontWeight: '500' }]}>{row.name}</Text>
                        <Text style={styles.cell}>{row.skinsWon}</Text>
                        <Text style={styles.cell}>{row.holesPlayed}</Text>
                        <Text style={[styles.cell, { flex: 2, fontWeight: 'bold', color: '#4CD964' }]}>
                            {row.winnings > 0 ? '+' : ''}{row.winnings.toFixed(2)}
                        </Text>
                    </View>
                ))}
            </View>

            <View style={styles.footer}>
                <Text style={styles.footerText}>* Net only includes bets for holes that were won (settled).</Text>
            </View>

            <Text style={[styles.title, { marginTop: 30 }]}>Hole History</Text>
            <View style={styles.historyList}>
                {holeResults
                    .sort((a, b) => a.holeNumber - b.holeNumber)
                    .map((res) => {
                        const activePartsForHole = participants.filter(p =>
                            res.holeNumber >= p.startHole && (p.endHole === null || res.holeNumber <= p.endHole)
                        );

                        // Filter scores to only positive values (redundant but safe)
                        const validScores = Object.entries(res.participantScores).filter(([_, s]) => s > 0);
                        const scoreValues = validScores.map(([_, s]) => s);
                        const minScore = scoreValues.length > 0 ? Math.min(...scoreValues) : 999;
                        const winners = validScores.filter(([_, s]) => s === minScore).map(([name]) => name);

                        const isTie = winners.length !== 1;
                        const outcomeText = winners.length === 0 ? "Skipped" : (isTie ? "Carryover Created" : `Winner: ${winners[0]}`);

                        return (
                            <TouchableOpacity
                                key={res.holeNumber}
                                style={styles.historyCard}
                                onPress={() => navigation.navigate("Scoring", { roundId, jumpToHole: res.holeNumber })}
                            >
                                <View style={styles.historyCardHeader}>
                                    <Text style={styles.holeTitle}>Hole {res.holeNumber}</Text>
                                    <View style={styles.outcomeBadge}>
                                        <Text style={[styles.outcomeText, isTie ? styles.tieText : styles.winnerText]}>
                                            {outcomeText}
                                        </Text>
                                        <Text style={styles.editHint}>Edit ✎</Text>
                                    </View>
                                </View>
                                <View style={styles.scoresGrid}>
                                    {activePartsForHole.map((p) => {
                                        const score = res.participantScores[p.name];
                                        const displayScore = (score !== undefined && score > 0) ? score.toString() : "-";
                                        const isWinner = winners.includes(p.name);

                                        return (
                                            <View key={p.name} style={styles.scoreItem}>
                                                <Text style={styles.scoreName}>{p.name}</Text>
                                                <Text style={[styles.scoreValue, isWinner && styles.winningScore]}>{displayScore}</Text>
                                            </View>
                                        );
                                    })}
                                </View>
                            </TouchableOpacity>
                        );
                    })}
            </View>

            {!round?.isCompleted && (
                <TouchableOpacity
                    style={[styles.mainHomeBtn, { backgroundColor: '#FF3B30' }]}
                    onPress={async () => {
                        await DatabaseService.completeRound(roundId);
                        loadData(); // Reload to update status
                    }}
                >
                    <Text style={styles.mainHomeBtnText}>Finalize Round (Lock Scores)</Text>
                </TouchableOpacity>
            )}

            {round?.isCompleted && (
                <TouchableOpacity
                    style={styles.mainHomeBtn}
                    onPress={() => navigation.popToTop()}
                >
                    <Text style={styles.mainHomeBtnText}>Exit to Home</Text>
                </TouchableOpacity>
            )}

            <View style={{ height: 100 }} />
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: "#fff" },
    centered: { flex: 1, justifyContent: "center" },
    title: { fontSize: 32, fontWeight: "bold", marginBottom: 5, textAlign: 'center', flex: 1 },
    subtitle: { fontSize: 16, color: "#666", marginBottom: 30 },
    table: { borderWidth: 1, borderColor: '#eee', borderRadius: 10, overflow: 'hidden' },
    tableHeader: { flexDirection: 'row', backgroundColor: '#f9f9f9', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
    tableRow: { flexDirection: 'row', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#eee', alignItems: 'center' },
    alternateRow: { backgroundColor: '#fcfcfc' },
    cell: { flex: 1, textAlign: 'center', fontSize: 15 },
    headerCell: { fontWeight: 'bold', color: '#8e8e93', textTransform: 'uppercase', fontSize: 12 },
    footer: { marginTop: 30, paddingBottom: 10 },
    footerText: { fontSize: 12, color: '#999', fontStyle: 'italic' },
    historyList: { marginTop: 10 },
    historyCard: { backgroundColor: '#fdfdfd', borderWidth: 1, borderColor: '#eee', borderRadius: 10, padding: 15, marginBottom: 15 },
    historyCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', paddingBottom: 5 },
    holeTitle: { fontSize: 16, fontWeight: 'bold' },
    outcomeText: { fontSize: 16, fontWeight: '700' },
    tieText: { color: '#FF9500' },
    winnerText: { color: '#4CD964' },
    scoresGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    scoreItem: { width: '50%', flexDirection: 'row', justifyContent: 'space-between', paddingRight: 15, marginBottom: 5 },
    scoreName: { color: '#666', fontSize: 14 },
    scoreValue: { fontWeight: '500', fontSize: 14 },
    winningScore: { color: '#4CD964', fontWeight: 'bold' },
    outcomeBadge: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    editHint: { fontSize: 10, color: '#007AFF', fontStyle: 'italic' },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 },
    historyBtn: { backgroundColor: '#f0f0f0', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', flexDirection: 'row', alignItems: 'center', gap: 5 },
    historyBtnText: { fontSize: 14, fontWeight: '600', color: '#333' },
    mainHomeBtn: { backgroundColor: '#28A745', padding: 18, borderRadius: 12, alignItems: 'center', marginTop: 20 },
    mainHomeBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    exportRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    exportBtn: { flex: 1, backgroundColor: '#FF9500', padding: 12, borderRadius: 8, alignItems: 'center' },
    exportBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 }
});
