import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform, Share } from 'react-native';
import { DatabaseService } from '../data/database';
import { RoundCalculator } from '../domain/RoundCalculator';
import { Round } from '../types';

export const ReportService = {
    async generateAndShareReport() {
        try {
            const allRounds = await DatabaseService.getAllRounds();
            if (allRounds.length === 0) {
                alert("No rounds found to export.");
                return;
            }

            // Interface extension hack to silence TS if `grossWinnings` isn't on the official ReturnType yet in this file's context
            // But we updated RoundCalculator.ts so it should be fine.

            const currentYear = new Date().getFullYear();
            const now = new Date();

            // 1. Identify Most Recent Day
            const latestRound = allRounds[0];
            const latestDate = (latestRound && !isNaN(new Date(latestRound.date).getTime()))
                ? new Date(latestRound.date)
                : new Date();
            const mostRecentDayStr = latestDate.toDateString();

            const recentDayRounds = allRounds.filter(r => new Date(r.date).toDateString() === mostRecentDayStr);
            const yearRounds = allRounds.filter(r => new Date(r.date).getFullYear() === currentYear);

            let reportText = `DROP-IN SKINS REPORT\n`;
            reportText += `Generated: ${now.toLocaleString()}\n`;
            reportText += `===============================\n\n`;

            // --- MOST RECENT DAY RESULTS ---
            reportText += `MOST RECENT DAY: ${mostRecentDayStr}\n`;
            reportText += `-------------------------------\n`;

            for (const round of recentDayRounds) {
                if (!round.date) {
                    console.warn(`[ReportService] Round #${round.id} is missing date, skipping from calculations.`);
                    continue;
                }
                const data = await DatabaseService.getFullRoundData(round.id!);
                const results = RoundCalculator.calculateRoundResults(
                    round,
                    data.participants,
                    data.holeResults,
                    data.carryovers
                );

                if (!results || !results.balances) {
                    console.error(`[ReportService] Failed to calculate results for round #${round.id}`);
                    continue;
                }
                const { balances, leaderboard, grossWinnings } = results;

                reportText += `Round #${round.id} - ${new Date(round.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\n`;
                reportText += `Holes: ${round.totalHoles}, Bet: $${round.betAmount.toFixed(2)}\n\n`;

                reportText += `HOLE-BY-HOLE RESULTS:\n`;
                const sortedHoles = [...data.holeResults].sort((a, b) => a.holeNumber - b.holeNumber);

                for (const hr of sortedHoles) {
                    const scores = hr.participantScores;
                    const validScores = Object.entries(scores).filter(([_, s]) => s > 0);
                    if (validScores.length === 0) continue; // Skip holes with no valid scores

                    const minScore = Math.min(...validScores.map(([_, s]) => s));
                    const winners = validScores.filter(([_, s]) => s === minScore).map(([name]) => name);

                    let outcomeText = "";
                    if (winners.length === 0) outcomeText = "No valid scores";
                    else if (winners.length > 1) outcomeText = `Tie: ${winners.join(", ")}`;
                    else outcomeText = `Winner: ${winners[0]}`;

                    reportText += `Hole ${hr.holeNumber}: ${outcomeText} (${minScore || '-'})\n`;
                }

                reportText += `\nROUND RESULTS:\n`;
                Object.entries(balances)
                    .sort((a, b) => b[1] - a[1])
                    .forEach(([name, bal]) => {
                        const skins = leaderboard[name] || 0;
                        const winnings = grossWinnings ? (grossWinnings[name] || 0) : 0;

                        // Format: "Player A: 3 Skins (Winnings: +$900.00) | Net: +$800.00"
                        const skinsStr = `${skins} Skin${skins !== 1 ? 's' : ''}`;
                        const winStr = winnings > 0 ? `(+$${winnings.toFixed(2)})` : `($0.00)`;
                        const netStr = `${bal >= 0 ? '+' : ''}$${bal.toFixed(2)}`;

                        reportText += `${name.padEnd(10)}: ${skinsStr.padEnd(9)} ${winStr.padEnd(12)} | Net: ${netStr}\n`;
                    });
                reportText += `\n-------------------------------\n`;
            }

            // --- YEAR TO DATE SUMMARY ---
            reportText += `\nYEAR TO DATE SUMMARY (${currentYear})\n`;
            reportText += `-------------------------------\n`;
            reportText += `Total Rounds Played: ${yearRounds.length}\n\n`;

            const ytdTotals: Record<string, number> = {};
            const ytdWinnings: Record<string, number> = {};

            for (const round of yearRounds) {
                if (!round.date) continue;
                const data = await DatabaseService.getFullRoundData(round.id!);
                const results = RoundCalculator.calculateRoundResults(
                    round,
                    data.participants,
                    data.holeResults,
                    data.carryovers
                );
                if (!results || !results.balances) continue;

                const { balances, grossWinnings } = results;

                Object.entries(balances).forEach(([name, bal]) => {
                    ytdTotals[name] = (ytdTotals[name] || 0) + bal;
                });

                if (grossWinnings) {
                    Object.entries(grossWinnings).forEach(([name, won]) => {
                        ytdWinnings[name] = (ytdWinnings[name] || 0) + won;
                    });
                }
            }

            reportText += `CUMULATIVE YTD BALANCES:\n`;
            Object.entries(ytdTotals)
                .sort((a, b) => b[1] - a[1])
                .forEach(([name, total]) => {
                    const winnings = ytdWinnings[name] || 0;
                    const winStr = winnings > 0 ? `(+$${winnings.toFixed(2)})` : `($0.00)`;
                    const netStr = `${total >= 0 ? '+' : ''}$${total.toFixed(2)}`;

                    // Format: "Player A:   (+$120.00) | Net: +$45.00"
                    reportText += `${name.padEnd(15)}: ${winStr.padEnd(12)} | Net: ${netStr}\n`;
                });

            reportText += `\n===============================\n`;
            reportText += `End of Report\n`;

            // 2. Share the Report
            const fileName = `Skins_Report_${latestDate.toISOString().split('T')[0]}.txt`;

            if (Platform.OS === 'web') {
                const blob = new Blob([reportText], { type: 'text/plain' });
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', fileName);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
            } else {
                // Share as plain text message
                const result = await Share.share({
                    message: reportText,
                    title: 'Drop-In Skins Report'
                });
            }

        } catch (error: any) {
            console.error("[ReportService] Error generating report:", error);
            alert(`Failed to generate report: ${error?.message || 'Unknown error'}`);
        }
    },

    async generateAndShareCSV() {
        try {
            const allRounds = await DatabaseService.getAllRounds();
            if (allRounds.length === 0) {
                alert("No rounds found to export.");
                return;
            }

            const latestRound = allRounds[0];
            const latestDate = (latestRound && !isNaN(new Date(latestRound.date).getTime()))
                ? new Date(latestRound.date)
                : new Date();

            // Generate overall YTD spreadsheet
            let csvContent = `Round ID,Date,Hole,Player,Score,Outcome,Skins Won,Net Balance\n`;

            for (const round of allRounds) {
                if (!round.date) continue;
                const data = await DatabaseService.getFullRoundData(round.id!);
                const results = RoundCalculator.calculateRoundResults(
                    round,
                    data.participants,
                    data.holeResults,
                    data.carryovers
                );
                if (!results) continue;

                const { holeOutcomes, balances } = results;
                const dateStr = new Date(round.date).toISOString().split('T')[0];

                // Add hole-by-hole data
                for (const outcome of holeOutcomes) {
                    const winners = outcome.winners || [];
                    const participants = Object.keys(outcome.scores);

                    for (const pName of participants) {
                        const score = outcome.scores[pName] || 0;
                        let outcomeType = "None";

                        // Note: Skins tokens are calculated in the aggregate balances, 
                        // but we can try to deduce per-hole wins if we want detail.
                        // However, simpler to just list the Score Outcome.
                        if (winners.includes(pName)) {
                            outcomeType = winners.length > 1 ? "Tie" : "Win";
                        } else if (winners.length === 0) {
                            outcomeType = "Carryover"; // or Skipped
                        }

                        // We don't have granular "Skins Won on this hole" easily available in this view structure
                        // without looking at the skinsBoard diff, but 'Net Balance' is available per player in summary.
                        // For the detailed CSV, we'll leave "Skins Won" as 0 here and rely on Summary Rows.
                        csvContent += `${round.id},${dateStr},${outcome.holeNumber},"${pName}",${score},${outcomeType},-,-\n`;
                    }
                }

                // Add summary rows for the round
                Object.entries(balances).forEach(([name, bal]) => {
                    // Get skins count from skinsBoard if we had it, but we only have 'balances' here in this destructured scope.
                    // We need to grab 'leaderboard' (skinsBoard) from results.
                    const skinsCount = results.leaderboard[name] || 0;
                    csvContent += `${round.id},${dateStr},SUMMARY,"${name}",0,Round Total,${skinsCount},${bal.toFixed(2)}\n`;
                });
            }

            const fileName = `Skins_Data_${latestDate.toISOString().split('T')[0]}.csv`;

            if (Platform.OS === 'web') {
                const blob = new Blob([csvContent], { type: 'text/csv' });
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', fileName);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
            } else {
                const baseDir = FileSystem.cacheDirectory;
                if (!baseDir) throw new Error("No writable directory found.");
                const fileUri = baseDir + fileName;

                await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: FileSystem.EncodingType.UTF8 });

                if (await Sharing.isAvailableAsync()) {
                    await Sharing.shareAsync(fileUri, {
                        mimeType: 'text/csv',
                        dialogTitle: 'Export Skins CSV',
                        UTI: 'public.comma-separated-values-text'
                    });
                } else {
                    alert("Sharing is not available on this device.");
                }
            }
        } catch (error: any) {
            console.error("[ReportService] Error generating CSV:", error);
            alert(`Failed to generate CSV: ${error?.message || 'Unknown error'}`);
        }
    }
};
