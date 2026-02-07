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
            const [name, phone, email] = args;
            const newPlayer = { id: webMock.players.length + 1, name, phone, email };
            webMock.players.push(newPlayer);
            return { lastInsertRowId: newPlayer.id };
        }
        if (sql.includes("INSERT INTO rounds")) {
            const [totalHoles, betAmount, date, useCarryovers, initialCoAmount, initialCoEligible] = args;
            const newRound = {
                id: webMock.rounds.length + 1,
                totalHoles,
                betAmount,
                date,
                isCompleted: false,
                useCarryovers: !!useCarryovers,
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
            if (sql.includes("originatingHole > 0")) {
                const roundId = args[0];
                webMock.carryovers = webMock.carryovers.filter(c => !(c.roundId === roundId && c.originatingHole > 0));
                return { lastInsertRowId: 1 };
            }
            const [roundId, holeNumber] = args;
            webMock.carryovers = webMock.carryovers.filter(c => !(c.roundId === roundId && c.originatingHole === holeNumber));
            return { lastInsertRowId: 1 };
        }
        if (sql.includes("UPDATE carryovers SET isWon = 0")) {
            const roundId = args[0];
            webMock.carryovers.forEach(c => {
                if (c.roundId === roundId && c.originatingHole === 0) c.isWon = 0;
            });
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
        if (sql.includes("UPDATE players SET")) {
            // handle simple update name... actual parsing of UPDATE string is hard in mock
            // Assuming the call is UPDATE players SET name=?, phone=?, email=? WHERE id=?
            if (sql.includes("name = ?")) {
                // If it's the full update
                const [name, phone, email, id] = args;
                const player = webMock.players.find(p => p.id === id);
                if (player) {
                    player.name = name;
                    player.phone = phone;
                    player.email = email;
                }
                return { lastInsertRowId: id };
            }
            // Handle simple name update (legacy calls if any remaining?)
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
                name TEXT NOT NULL,
                phone TEXT,
                email TEXT
            );
            CREATE TABLE IF NOT EXISTS rounds (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                totalHoles INTEGER,
                betAmount REAL,
                date INTEGER,
                isCompleted INTEGER DEFAULT 0,
                useCarryovers INTEGER DEFAULT 1
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

        // Migrations
        const runMigration = async (sql: string) => {
            try {
                await db.execAsync(sql);
            } catch (e) {
                // Ignore errors (usually column/table already exists)
            }
        };

        await runMigration("ALTER TABLE rounds ADD COLUMN initialCarryoverAmount REAL DEFAULT 0;");
        await runMigration("ALTER TABLE rounds ADD COLUMN initialCarryoverEligibleNames TEXT DEFAULT '[]';");
        await runMigration("ALTER TABLE rounds ADD COLUMN useCarryovers INTEGER DEFAULT 1;");
        await runMigration(`
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            );
        `);
        await runMigration("ALTER TABLE players ADD COLUMN phone TEXT;");
        await runMigration("ALTER TABLE players ADD COLUMN email TEXT;");

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
    async addPlayer(name: string, phone?: string, email?: string) {
        const db = await getDb();
        return await db.runAsync("INSERT INTO players (name, phone, email) VALUES (?, ?, ?)", name, phone || "", email || "");
    },
    async updatePlayer(id: number, newName: string, phone?: string, email?: string) {
        const db = await getDb();
        return await db.runAsync("UPDATE players SET name = ?, phone = ?, email = ? WHERE id = ?", newName, phone || "", email || "", id);
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

    async createRound(totalHoles: number, betAmount: number, useCarryovers: boolean) {
        const db = await getDb();
        const result = await db.runAsync(
            "INSERT INTO rounds (totalHoles, betAmount, date, useCarryovers) VALUES (?, ?, ?, ?)",
            totalHoles,
            betAmount,
            Date.now(),
            useCarryovers ? 1 : 0
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
        const row = await db.getFirstAsync<any>("SELECT * FROM rounds WHERE isCompleted = 0 ORDER BY date DESC LIMIT 1");
        if (!row) return null;
        return {
            ...row,
            isCompleted: !!row.isCompleted,
            useCarryovers: !!row.useCarryovers
        } as Round;
    },

    async getRoundById(id: number) {
        const db = await getDb();
        const row = await db.getFirstAsync<any>("SELECT * FROM rounds WHERE id = ?", id);
        if (!row) return null;
        return {
            ...row,
            isCompleted: !!row.isCompleted,
            useCarryovers: !!row.useCarryovers
        } as Round;
    },

    async getAllRounds() {
        const db = await getDb();
        const rows = await db.getAllAsync<any>("SELECT * FROM rounds ORDER BY date DESC");
        return rows.map(r => ({
            ...r,
            isCompleted: !!r.isCompleted,
            useCarryovers: !!r.useCarryovers
        })) as Round[];
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
        const result = await db.runAsync(
            "INSERT INTO carryovers (roundId, originatingHole, amount, eligibleNames) VALUES (?, ?, ?, ?)",
            roundId,
            originatingHole,
            amount,
            JSON.stringify(eligibleNames)
        );
        return result.lastInsertRowId;
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
    },
    async resetRoundCarryovers(roundId: number) {
        const db = await getDb();
        // Delete generated carryovers (hole > 0)
        await db.runAsync("DELETE FROM carryovers WHERE roundId = ? AND originatingHole > 0", roundId);
        // Reset valid initial carryovers (hole 0) to not won
        await db.runAsync("UPDATE carryovers SET isWon = 0 WHERE roundId = ? AND originatingHole = 0", roundId);
    },

    async exportData() {
        const db = await getDb();
        const players = await db.getAllAsync("SELECT * FROM players");
        const rounds = await db.getAllAsync("SELECT * FROM rounds");
        const participants = await db.getAllAsync("SELECT * FROM participants");
        const holeResults = await db.getAllAsync("SELECT * FROM hole_results");
        const carryovers = await db.getAllAsync("SELECT * FROM carryovers");

        return JSON.stringify({
            version: 1,
            timestamp: Date.now(),
            data: { players, rounds, participants, holeResults, carryovers }
        });
    },

    async importData(jsonString: string) {
        const db = await getDb();
        try {
            const parsed = JSON.parse(jsonString);
            if (!parsed.data) throw new Error("Invalid backup format");

            const { players, rounds, participants, holeResults, carryovers } = parsed.data;

            // Simple Transaction-like approach (Sequentially delete then insert)
            // Note: In a real app we'd want a proper transaction
            await db.execAsync("DELETE FROM players; DELETE FROM rounds; DELETE FROM participants; DELETE FROM hole_results; DELETE FROM carryovers;");

            // Re-inflate
            // We use simple loops because runAsync doesn't support bulk insert well in all expo-sqlite versions without manual query building
            for (const p of players) {
                await db.runAsync("INSERT INTO players (id, name, phone, email) VALUES (?, ?, ?, ?)", p.id, p.name, p.phone, p.email);
            }
            for (const r of rounds) {
                await db.runAsync(
                    "INSERT INTO rounds (id, totalHoles, betAmount, date, isCompleted, useCarryovers, initialCarryoverAmount, initialCarryoverEligibleNames) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    r.id, r.totalHoles, r.betAmount, r.date, r.isCompleted, r.useCarryovers, r.initialCarryoverAmount, r.initialCarryoverEligibleNames
                );
            }
            for (const p of participants) {
                await db.runAsync(
                    "INSERT INTO participants (id, roundId, name, startHole, endHole) VALUES (?, ?, ?, ?, ?)",
                    p.id, p.roundId, p.name, p.startHole, p.endHole
                );
            }
            for (const h of holeResults) {
                await db.runAsync(
                    "INSERT INTO hole_results (id, roundId, holeNumber, scores) VALUES (?, ?, ?, ?)",
                    h.id, h.roundId, h.holeNumber, h.scores
                );
            }
            for (const c of carryovers) {
                await db.runAsync(
                    "INSERT INTO carryovers (id, roundId, originatingHole, amount, eligibleNames, isWon) VALUES (?, ?, ?, ?, ?, ?)",
                    c.id, c.roundId, c.originatingHole, c.amount, c.eligibleNames, c.isWon
                );
            }

            return true;
        } catch (e) {
            console.error("Import failed:", e);
            throw e;
        }
    },

    async getSetting(key: string) {
        const db = await getDb();
        const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = ?", key);
        return row ? row.value : null;
    },

    async setSetting(key: string, value: string) {
        const db = await getDb();
        await db.runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", key, value);
    }
};
