import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

// Database file path
const DB_PATH = path.resolve(process.cwd(), 'db/emotion_game.db');

// Database connection
let db = null;

/**
 * Initialize the database connection and create tables
 */
async function initializeDatabase() {
    try {
        // Open database connection
        db = await open({
            filename: DB_PATH,
            driver: sqlite3.Database
        });

        // Enable foreign keys
        await db.exec('PRAGMA foreign_keys = ON;');

        // Create tables
        await createTables();
        
        console.log(`\x1b[32m░░░\x1b[0m Database initialized successfully`);
        return db;
    } catch (error) {
        console.error('Database initialization failed:', error);
        throw error;
    }
}

/**
 * Create the required database tables
 */
async function createTables() {
    // Create game_sessions table
    await db.exec(`
        CREATE TABLE IF NOT EXISTS game_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_name TEXT NOT NULL,
            started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME,
            emotions_completed INTEGER DEFAULT 0,
            total_score REAL,
            session_data TEXT
        );
    `);

    // Create emotion_attempts table
    await db.exec(`
        CREATE TABLE IF NOT EXISTS emotion_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER REFERENCES game_sessions(id),
            target_emotion TEXT NOT NULL,
            detected_emotion TEXT,
            confidence_score REAL,
            attempt_duration INTEGER,
            coaching_provided TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            photo_data TEXT
        );
    `);

    console.log(`\x1b[33m⣢\x1b[0m Database tables created successfully`);
}

/**
 * Get the database connection
 */
function getDatabase() {
    if (!db) {
        throw new Error('Database not initialized. Call initializeDatabase() first.');
    }
    return db;
}

/**
 * Create a new game session
 */
async function createGameSession(userName) {
    const database = getDatabase();
    const result = await database.run(
        'INSERT INTO game_sessions (user_name, session_data) VALUES (?, ?)',
        [userName, JSON.stringify({ conversation_history: [] })]
    );
    return result.lastID;
}

/**
 * Update game session
 */
async function updateGameSession(sessionId, updates) {
    const database = getDatabase();
    const { completed_at, emotions_completed, total_score, session_data } = updates;
    
    const fields = [];
    const values = [];
    
    if (completed_at !== undefined) {
        fields.push('completed_at = ?');
        values.push(completed_at);
    }
    if (emotions_completed !== undefined) {
        fields.push('emotions_completed = ?');
        values.push(emotions_completed);
    }
    if (total_score !== undefined) {
        fields.push('total_score = ?');
        values.push(total_score);
    }
    if (session_data !== undefined) {
        fields.push('session_data = ?');
        values.push(JSON.stringify(session_data));
    }
    
    values.push(sessionId);
    
    const query = `UPDATE game_sessions SET ${fields.join(', ')} WHERE id = ?`;
    await database.run(query, values);
}

/**
 * Create an emotion attempt record
 */
async function createEmotionAttempt(attemptData) {
    const database = getDatabase();
    const {
        session_id,
        target_emotion,
        detected_emotion,
        confidence_score,
        attempt_duration,
        coaching_provided,
        photo_data
    } = attemptData;

    const result = await database.run(`
        INSERT INTO emotion_attempts (
            session_id, target_emotion, detected_emotion, confidence_score,
            attempt_duration, coaching_provided, photo_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
        session_id, target_emotion, detected_emotion, confidence_score,
        attempt_duration, coaching_provided, photo_data
    ]);

    return result.lastID;
}

/**
 * Get game session by ID
 */
async function getGameSession(sessionId) {
    const database = getDatabase();
    const session = await database.get(
        'SELECT * FROM game_sessions WHERE id = ?',
        [sessionId]
    );
    
    if (session && session.session_data) {
        session.session_data = JSON.parse(session.session_data);
    }
    
    return session;
}

/**
 * Get user's game history
 */
async function getUserGameHistory(userName, limit = 10) {
    const database = getDatabase();
    const sessions = await database.all(`
        SELECT gs.*, 
               COUNT(ea.id) as total_attempts,
               AVG(ea.confidence_score) as avg_confidence
        FROM game_sessions gs
        LEFT JOIN emotion_attempts ea ON gs.id = ea.session_id
        WHERE gs.user_name = ?
        GROUP BY gs.id
        ORDER BY gs.started_at DESC
        LIMIT ?
    `, [userName, limit]);

    return sessions.map(session => ({
        ...session,
        session_data: session.session_data ? JSON.parse(session.session_data) : null
    }));
}

/**
 * Get emotion attempts for a session
 */
async function getSessionEmotionAttempts(sessionId) {
    const database = getDatabase();
    return await database.all(
        'SELECT * FROM emotion_attempts WHERE session_id = ? ORDER BY timestamp ASC',
        [sessionId]
    );
}

/**
 * Get analytics data for comparative analysis
 */
async function getAnalyticsData(userName = null) {
    const database = getDatabase();
    
    // Base query for emotion performance
    const emotionQuery = `
        SELECT 
            target_emotion,
            COUNT(*) as total_attempts,
            AVG(confidence_score) as avg_confidence,
            AVG(attempt_duration) as avg_duration,
            COUNT(CASE WHEN confidence_score >= 70 THEN 1 END) as successful_attempts
        FROM emotion_attempts ea
        JOIN game_sessions gs ON ea.session_id = gs.id
        ${userName ? 'WHERE gs.user_name = ?' : ''}
        GROUP BY target_emotion
    `;
    
    const params = userName ? [userName] : [];
    const emotionStats = await database.all(emotionQuery, params);
    
    // Overall statistics
    const overallQuery = `
        SELECT 
            COUNT(DISTINCT gs.id) as total_sessions,
            COUNT(ea.id) as total_attempts,
            AVG(ea.confidence_score) as overall_avg_confidence,
            AVG(gs.total_score) as avg_session_score
        FROM game_sessions gs
        LEFT JOIN emotion_attempts ea ON gs.id = ea.session_id
        ${userName ? 'WHERE gs.user_name = ?' : ''}
    `;
    
    const overallStats = await database.get(overallQuery, params);
    
    return {
        emotion_performance: emotionStats,
        overall_statistics: overallStats,
        user_specific: Boolean(userName)
    };
}

export {
    initializeDatabase,
    getDatabase,
    createGameSession,
    updateGameSession,
    createEmotionAttempt,
    getGameSession,
    getUserGameHistory,
    getSessionEmotionAttempts,
    getAnalyticsData
}; 