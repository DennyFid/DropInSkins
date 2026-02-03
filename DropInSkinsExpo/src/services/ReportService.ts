import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
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
            const latestDate = new Date(latestRound.date);
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
                const data = await DatabaseService.getFullRoundData(round.id!);
                const { balances } = RoundCalculator.calculateRoundResults(
                    round,
                    data.participants,
                    data.holeResults,
                    data.carryovers
                );

                reportText += `Round #${round.id} - ${new Date(round.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\n`;
                reportText += `Holes: ${round.totalHoles}, Bet: $${round.betAmount.toFixed(2)}\n\n`;

                reportText += `HOLE-BY-HOLE RESULTS:\n`;
                const sortedHoles = [...data.holeResults].sort((a, b) => a.holeNumber - b.holeNumber);

                for (const hr of sortedHoles) {
                    const scores = hr.participantScores;
                    const validScores = Object.entries(scores).filter(([_, s]) => s > 0);
                    const minScore = validScores.length > 0 ? Math.min(...validScores.map(([_, s]) => s)) : null;
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
                const data = await DatabaseService.getFullRoundData(round.id!);
                const { balances } = RoundCalculator.calculateRoundResults(
                    round,
                    data.participants,
                    data.holeResults,
                    data.carryovers
                );
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
            // @ts-ignore
            const fileUri = (FileSystem.documentDirectory || FileSystem.cacheDirectory) + fileName;

            await FileSystem.writeAsStringAsync(fileUri, reportText);

            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(fileUri, {
                    mimeType: 'text/plain',
                    dialogTitle: 'Export Skins Report',
                    UTI: 'public.plain-text'
                });
            } else {
                alert("Sharing is not available on this device.");
            }

        } catch (error) {
            console.error("[ReportService] Error generating report:", error);
            alert("Failed to generate report. Please try again.");
        }
    }
};
