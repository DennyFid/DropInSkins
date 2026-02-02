import * as SQLite from "expo-sqlite";
import { Round, Participant, HoleResult, Carryover, Player } from "../types";

import { Platform } from "react-native";

const dbName = "dropinskins.db";
let sqliteDbSingleton: SimpleDb | null = null;

// In-memory mock for web testing
const webMock = {
    players: [] as any[],
    rounds: [] as any[],
    participants: [] as any[],
    holeResults: [] as any[],
    carryovers: [] as any[],

    runAsync: async (sql: string, ...args: any[]): Promise<any> => {
        if (sql.includes("INSERT INTO players")) {
            const name = args[0];
            const newPlayer = { id: webMock.players.length + 1, name };
            webMock.players.push(newPlayer);
            return { lastInsertRowId: newPlayer.id };
        }
        if (sql.includes("INSERT INTO rounds")) {
            const [totalHoles, betAmount, date, initialCoAmount, initialCoEligible] = args;
            const newRound = {
                id: webMock.rounds.length + 1,
                totalHoles,
                betAmount,
                date,
                isCompleted: false,
                initialCarryoverAmount: initialCoAmount || 0,
                initialCarryoverEligibleNames: initialCoEligible || "[]"
            };
            webMock.rounds.push(newRound);
            return { lastInsertRowId: newRound.id };
        }
        if (sql.includes("INSERT INTO participants")) {
            const [roundId, name, startHole] = args;
            const newPart = { id: webMock.participants.length + 1, roundId, name, startHole, endHole: null };
            webMock.participants.push(newPart);
            return { lastInsertRowId: newPart.id };
        }
        if (sql.includes("UPDATE participants SET endHole")) {
            const [endHole, id] = args;
            const part = webMock.participants.find(p => p.id === id);
            if (part) part.endHole = endHole;
            return { lastInsertRowId: id };
        }
        if (sql.includes("INSERT INTO hole_results")) {
            const [roundId, holeNumber, scores] = args;
            webMock.holeResults.push({ id: webMock.holeResults.length + 1, roundId, holeNumber, scores });
            return { lastInsertRowId: webMock.holeResults.length };
        }
        if (sql.includes("INSERT INTO carryovers")) {
            const [roundId, originatingHole, amount, eligibleNames] = args;
            webMock.carryovers.push({ id: webMock.carryovers.length + 1, roundId, originatingHole, amount, eligibleNames, isWon: 0 });
            return { lastInsertRowId: webMock.carryovers.length };
        }
        if (sql.includes("UPDATE carryovers SET isWon = 1")) {
            const id = args[0];
            const co = webMock.carryovers.find(c => c.id === id);
            if (co) co.isWon = 1;
            return { lastInsertRowId: id };
        }
        if (sql.includes("DELETE FROM hole_results")) {
            const [roundId, holeNumber] = args;
            webMock.holeResults = webMock.holeResults.filter(r => !(r.roundId === roundId && r.holeNumber === holeNumber));
            return { lastInsertRowId: 1 };
        }
        if (sql.includes("DELETE FROM carryovers")) {
            const [roundId, holeNumber] = args;
            webMock.carryovers = webMock.carryovers.filter(c => !(c.roundId === roundId && c.originatingHole === holeNumber));
            return { lastInsertRowId: 1 };
        }
        if (sql.includes("DELETE FROM rounds")) {
            const id = args[0];
            webMock.rounds = webMock.rounds.filter(r => r.id !== id);
            webMock.participants = webMock.participants.filter(p => p.roundId !== id);
            webMock.holeResults = webMock.holeResults.filter(r => r.roundId !== id);
            webMock.carryovers = webMock.carryovers.filter(c => c.roundId !== id);
            return { lastInsertRowId: id };
        }
        if (sql.includes("UPDATE players SET name")) {
            const [name, id] = args;
            const player = webMock.players.find(p => p.id === id);
            if (player) player.name = name;
            return { lastInsertRowId: id };
        }
        if (sql.includes("DELETE FROM players")) {
            const id = args[0];
            webMock.players = webMock.players.filter(p => p.id !== id);
            return { lastInsertRowId: id };
        }
        return { lastInsertRowId: 1 };
    },
    getAllAsync: async <T>(sql: string, ...args: any[]): Promise<T[]> => {
        if (sql.includes("SELECT COUNT(*) as count FROM participants WHERE name = ?")) {
            const name = args[0];
            const count = webMock.participants.filter(p => p.name === name).length;
            return [{ count }] as unknown as T[];
        }
        if (sql.includes("SELECT * FROM players")) return [...webMock.players] as unknown as T[];
        if (sql.includes("SELECT * FROM rounds")) return [...webMock.rounds].sort((a, b) => b.date - a.date) as unknown as T[];
        if (sql.includes("SELECT * FROM participants")) return webMock.participants.filter(p => p.roundId === args[0]) as unknown as T[];
        if (sql.includes("SELECT * FROM hole_results")) return webMock.holeResults.filter(r => r.roundId === args[0]) as unknown as T[];
        if (sql.includes("SELECT * FROM carryovers")) {
            const hasIsWonFilter = sql.includes("isWon = 0");
            return webMock.carryovers.filter(c =>
                c.roundId === args[0] && (!hasIsWonFilter || c.isWon === 0)
            ) as unknown as T[];
        }
        return [] as T[];
    },
    getFirstAsync: async <T>(sql: string, ...args: any[]): Promise<T | null> => {
        if (sql.includes("SELECT * FROM rounds WHERE isCompleted = 0")) return (webMock.rounds.find(r => !r.isCompleted) || null) as unknown as T;
        if (sql.includes("SELECT * FROM rounds WHERE id = ?")) return (webMock.rounds.find(r => r.id === args[0]) || null) as unknown as T;
        return null;
    },
    execAsync: async () => { },
};

export const initDatabase = async () => {
    if (Platform.OS === "web") {
        console.warn("Using in-memory mock database for web environment");
        return webMock;
    }

    try {
        if (sqliteDbSingleton && (Platform.OS as any) !== "web") return sqliteDbSingleton;

        const db = await SQLite.openDatabaseAsync(dbName);
        sqliteDbSingleton = db as unknown as SimpleDb;

        await db.execAsync(`
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS players (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE
            );
            CREATE TABLE IF NOT EXISTS rounds (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                totalHoles INTEGER,
                betAmount REAL,
                date INTEGER,
                isCompleted INTEGER DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS participants (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                roundId INTEGER,
                name TEXT,
                startHole INTEGER,
                endHole INTEGER,
                FOREIGN KEY(roundId) REFERENCES rounds(id)
            );
            CREATE TABLE IF NOT EXISTS hole_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                roundId INTEGER,
                holeNumber INTEGER,
                scores TEXT,
                FOREIGN KEY(roundId) REFERENCES rounds(id)
            );
            CREATE TABLE IF NOT EXISTS carryovers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                roundId INTEGER,
                originatingHole INTEGER,
                amount REAL,
                eligibleNames TEXT,
                isWon INTEGER DEFAULT 0,
                FOREIGN KEY(roundId) REFERENCES rounds(id)
            );
        `);

        // Migration: Add new columns to rounds if they don't exist
        try {
            await db.execAsync("ALTER TABLE rounds ADD COLUMN initialCarryoverAmount REAL DEFAULT 0;");
            await db.execAsync("ALTER TABLE rounds ADD COLUMN initialCarryoverEligibleNames TEXT DEFAULT '[]';");
        } catch (e) {
            // Columns likely already exist
        }

        return db;
    } catch (e) {
        console.error("Database initialization failed:", e);
        throw e;
    }
};

interface SimpleDb {
    runAsync(sql: string, ...args: any[]): Promise<any>;
    getAllAsync<T>(sql: string, ...args: any[]): Promise<T[]>;
    getFirstAsync<T>(sql: string, ...args: any[]): Promise<T | null>;
    execAsync(sql: string): Promise<void>;
}

const getDb = async (): Promise<SimpleDb> => {
    if (Platform.OS === "web") return webMock as unknown as SimpleDb;
    if (sqliteDbSingleton) return sqliteDbSingleton;

    // Fallback: if getDb is called before initDatabase, initialize it
    sqliteDbSingleton = await SQLite.openDatabaseAsync(dbName) as unknown as SimpleDb;
    return sqliteDbSingleton;
};

export const DatabaseService = {
    async addPlayer(name: string) {
        const db = await getDb();
        return await db.runAsync("INSERT INTO players (name) VALUES (?)", name);
    },
    async updatePlayer(id: number, newName: string) {
        const db = await getDb();
        return await db.runAsync("UPDATE players SET name = ? WHERE id = ?", newName, id);
    },
    async deletePlayer(id: number) {
        const db = await getDb();
        return await db.runAsync("DELETE FROM players WHERE id = ?", id);
    },
    async isPlayerReferenced(name: string) {
        const db = await getDb();
        const rows = await db.getAllAsync<{ count: number }>(
            "SELECT COUNT(*) as count FROM participants WHERE name = ?",
            name
        );
        return rows[0].count > 0;
    },

    async getAllPlayers() {
        const db = await getDb();
        return await db.getAllAsync<Player>("SELECT * FROM players");
    },

    async createRound(totalHoles: number, betAmount: number) {
        const db = await getDb();
        const result = await db.runAsync(
            "INSERT INTO rounds (totalHoles, betAmount, date) VALUES (?, ?, ?)",
            totalHoles,
            betAmount,
            Date.now()
        );
        return result.lastInsertRowId;
    },

    async deleteRound(roundId: number) {
        const db = await getDb();
        await db.runAsync("DELETE FROM participants WHERE roundId = ?", roundId);
        await db.runAsync("DELETE FROM hole_results WHERE roundId = ?", roundId);
        await db.runAsync("DELETE FROM carryovers WHERE roundId = ?", roundId);
        return await db.runAsync("DELETE FROM rounds WHERE id = ?", roundId);
    },

    async getActiveRound() {
        const db = await getDb();
        return await db.getFirstAsync<Round>("SELECT * FROM rounds WHERE isCompleted = 0 ORDER BY date DESC LIMIT 1");
    },

    async getRoundById(id: number) {
        const db = await getDb();
        return await db.getFirstAsync<Round>("SELECT * FROM rounds WHERE id = ?", id);
    },

    async getAllRounds() {
        const db = await getDb();
        return await db.getAllAsync<Round>("SELECT * FROM rounds ORDER BY date DESC");
    },

    async getFullRoundData(roundId: number) {
        const participants = await this.getParticipants(roundId);
        const holeResults = await this.getHoleResults(roundId);
        const carryovers = await this.getRoundHistoryCarryovers(roundId);
        return { participants, holeResults, carryovers };
    },

    async completeRound(roundId: number) {
        const db = await getDb();
        return await db.runAsync("UPDATE rounds SET isCompleted = 1 WHERE id = ?", roundId);
    },

    async addParticipant(roundId: number, name: string, startHole: number) {
        const db = await getDb();
        return await db.runAsync(
            "INSERT INTO participants (roundId, name, startHole) VALUES (?, ?, ?)",
            roundId,
            name,
            startHole
        );
    },

    async getParticipants(roundId: number) {
        const db = await getDb();
        return await db.getAllAsync<Participant>("SELECT * FROM participants WHERE roundId = ?", roundId);
    },

    async updateParticipantEndHole(id: number, endHole: number) {
        const db = await getDb();
        return await db.runAsync("UPDATE participants SET endHole = ? WHERE id = ?", endHole, id);
    },

    async saveHoleResult(roundId: number, holeNumber: number, scores: Record<string, number>) {
        const db = await getDb();
        return await db.runAsync(
            "INSERT INTO hole_results (roundId, holeNumber, scores) VALUES (?, ?, ?)",
            roundId,
            holeNumber,
            JSON.stringify(scores)
        );
    },

    async getHoleResults(roundId: number) {
        const db = await getDb();
        const rows = await db.getAllAsync<{ id: number; roundId: number; holeNumber: number; scores: string }>(
            "SELECT * FROM hole_results WHERE roundId = ?",
            roundId
        );
        return rows.map(r => ({
            ...r,
            participantScores: JSON.parse(r.scores)
        })) as HoleResult[];
    },

    async saveCarryover(roundId: number, originatingHole: number, amount: number, eligibleNames: string[]) {
        const db = await getDb();
        return await db.runAsync(
            "INSERT INTO carryovers (roundId, originatingHole, amount, eligibleNames) VALUES (?, ?, ?, ?)",
            roundId,
            originatingHole,
            amount,
            JSON.stringify(eligibleNames)
        );
    },

    async getCarryovers(roundId: number) {
        const db = await getDb();
        const rows = await db.getAllAsync<{ id: number; roundId: number; originatingHole: number; amount: number; eligibleNames: string; isWon: number }>(
            "SELECT * FROM carryovers WHERE roundId = ? AND isWon = 0",
            roundId
        );
        return rows.map(r => ({
            ...r,
            eligibleParticipantNames: JSON.parse(r.eligibleNames)
        })) as Carryover[];
    },

    async getRoundHistoryCarryovers(roundId: number) {
        const db = await getDb();
        const rows = await db.getAllAsync<{ id: number; roundId: number; originatingHole: number; amount: number; eligibleNames: string; isWon: number }>(
            "SELECT * FROM carryovers WHERE roundId = ?",
            roundId
        );
        return rows.map(r => ({
            ...r,
            eligibleParticipantNames: JSON.parse(r.eligibleNames)
        })) as Carryover[];
    },

    async markCarryoverAsWon(id: number) {
        const db = await getDb();
        return await db.runAsync("UPDATE carryovers SET isWon = 1 WHERE id = ?", id);
    },

    async deleteHoleData(roundId: number, holeNumber: number) {
        const db = await getDb();
        // Reset any carryovers created on this hole (mark as not won or delete)
        // Actually, we should delete them as they'll be re-created if still tied
        await db.runAsync("DELETE FROM hole_results WHERE roundId = ? AND holeNumber = ?", roundId, holeNumber);
        await db.runAsync("DELETE FROM carryovers WHERE roundId = ? AND originatingHole = ?", roundId, holeNumber);
    }
};
