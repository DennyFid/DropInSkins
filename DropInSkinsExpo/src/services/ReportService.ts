import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
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
                const { balances } = results;

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

                reportText += `\nROUND BALANCES:\n`;
                Object.entries(balances)
                    .sort((a, b) => b[1] - a[1])
                    .forEach(([name, bal]) => {
                        reportText += `${name.padEnd(15)}: ${bal >= 0 ? '+' : ''}${bal.toFixed(2)}\n`;
                    });
                reportText += `\n-------------------------------\n`;
            }

            // --- YEAR TO DATE SUMMARY ---
            reportText += `\nYEAR TO DATE SUMMARY (${currentYear})\n`;
            reportText += `-------------------------------\n`;
            reportText += `Total Rounds Played: ${yearRounds.length}\n\n`;

            const ytdTotals: Record<string, number> = {};
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
                const { balances } = results;
                Object.entries(balances).forEach(([name, bal]) => {
                    ytdTotals[name] = (ytdTotals[name] || 0) + bal;
                });
            }

            reportText += `CUMULATIVE YTD BALANCES:\n`;
            Object.entries(ytdTotals)
                .sort((a, b) => b[1] - a[1])
                .forEach(([name, total]) => {
                    reportText += `${name.padEnd(15)}: ${total >= 0 ? '+' : ''}${total.toFixed(2)}\n`;
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
                const baseDir = FileSystem.cacheDirectory;
                if (!baseDir) throw new Error("No writable directory found.");
                const fileUri = baseDir + fileName;

                await FileSystem.writeAsStringAsync(fileUri, reportText, { encoding: FileSystem.EncodingType.UTF8 });

                if (await Sharing.isAvailableAsync()) {
                    await Sharing.shareAsync(fileUri, {
                        mimeType: 'text/plain',
                        dialogTitle: 'Export Skins Report',
                        UTI: 'public.plain-text'
                    });
                } else {
                    alert("Sharing is not available on this device.");
                }
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
                        let skinsWon = 0;

                        if (winners.includes(pName)) {
                            outcomeType = winners.length > 1 ? "Tie" : "Win";
                            skinsWon = outcome.skinsTotal / winners.length;
                        } else if (winners.length === 0) {
                            outcomeType = "Carryover";
                        }

                        csvContent += `${round.id},${dateStr},${outcome.holeNumber},"${pName}",${score},${outcomeType},${skinsWon.toFixed(2)},0\n`;
                    }
                }

                // Add summary rows for the round
                Object.entries(balances).forEach(([name, bal]) => {
                    csvContent += `${round.id},${dateStr},SUMMARY,"${name}",0,Round Total,0,${bal.toFixed(2)}\n`;
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
