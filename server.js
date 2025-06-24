import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Import our custom modules
import {
    initializeDatabase, createGameSession, updateGameSession, createEmotionAttempt,
    getGameSession, getUserGameHistory, getAnalyticsData
} from './db/database.js';
import {
    validateRequest, gameSessionSchema, emotionFeedbackSchema,
    analyticsSchema, gameHistorySchema, createSuccessResponse,
    createErrorResponse, validateSessionExists
} from './utils/validation.js';
import AIService from './utils/ai-service.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const aiService = new AIService();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increased limit for photo data
app.use(express.static(path.resolve(process.cwd())));

// Initialize services
async function initializeServices() {
    try {
        await initializeDatabase();
        await aiService.loadConfig();
        console.log('All services initialized successfully');
    } catch (error) {
        console.error('Failed to initialize services:', error);
        process.exit(1);
    }
}

// --- API ENDPOINTS ---

/**
 * POST /api/game-session - Create a new game session
 */
app.post('/api/game-session', validateRequest(gameSessionSchema), async (req, res) => {
    try {
        const { user_name, coaching_preference } = req.body;

        const sessionId = await createGameSession(user_name);

        // Generate welcome message using AI service
        const welcomeMessage = await aiService.callOpenAI(
            `As a ${coaching_preference} emotion coach, welcome ${user_name} to the Emotion Detection Game. Keep it brief and encouraging (under 50 words).`,
            60
        );

        const response = createSuccessResponse({
            session_id: sessionId,
            user_name,
            welcome_message: welcomeMessage,
            coaching_preference,
            created_at: new Date().toISOString()
        });

        res.status(201).json(response);
    } catch (error) {
        console.error('Error creating game session:', error);
        res.status(500).json(
            createErrorResponse('Failed to create game session', 'INTERNAL_ERROR')
        );
    }
});

/**
 * POST /api/emotion-feedback - Submit emotion attempt and get AI coaching
 */
app.post('/api/emotion-feedback', validateRequest(emotionFeedbackSchema), async (req, res) => {
    try {
        const {
            session_id,
            target_emotion,
            detected_emotion,
            confidence_score,
            attempt_duration,
            photo_data,
            conversation_context
        } = req.body;

        // Validate session exists
        const sessionExists = await validateSessionExists(session_id);
        if (!sessionExists) {
            return res.status(404).json(
                createErrorResponse('Session not found', 'SESSION_NOT_FOUND')
            );
        }

        // Generate AI coaching using advanced prompt engineering
        const coachingData = {
            targetEmotion: target_emotion,
            detectedEmotion: detected_emotion,
            confidenceScore: confidence_score,
            attemptDuration: attempt_duration
        };

        // Get session to determine coaching preference
        const session = await getGameSession(session_id);
        const personaType = session?.session_data?.coaching_preference || 'encouraging';

        // Get structured coaching response
        const coaching = await aiService.generateEmotionCoaching(
            coachingData,
            session_id,
            personaType
        );

        // Store emotion attempt in database
        const attemptId = await createEmotionAttempt({
            session_id,
            target_emotion,
            detected_emotion,
            confidence_score,
            attempt_duration,
            coaching_provided: coaching,
            photo_data
        });

        // Update session data with conversation context
        const conversationSummary = aiService.getConversationSummary(session_id);
        await updateGameSession(session_id, {
            session_data: {
                ...session.session_data,
                ...conversationSummary,
                last_attempt: new Date().toISOString()
            }
        });

        // Enhanced response with structured coaching data
        const response = createSuccessResponse({
            attempt_id: attemptId,
            coaching_message: coaching,
            confidence_analysis: {
                score: confidence_score,
                target_met: confidence_score >= 70,
                improvement_trend: conversationSummary.performance_summary.trend
            },
            session_progress: {
                total_attempts: conversationSummary.performance_summary.count + 1,
                average_confidence: conversationSummary.performance_summary.average
            },
            structured_coaching: {
                message: coaching,
                confidence_level: confidence_score < 40 ? 'low' : confidence_score < 70 ? 'medium' : 'high',
                technique_tips: [
                    confidence_score < 40 ? 'Focus on basic expression fundamentals' : 
                    confidence_score < 70 ? 'Refine your technique with specific adjustments' : 
                    'Maintain consistency and try advanced variations'
                ],
                encouragement_level: personaType
            }
        });

        res.json(response);
    } catch (error) {
        console.error('Error processing emotion feedback:', error);
        res.status(500).json(
            createErrorResponse('Failed to process emotion feedback', 'INTERNAL_ERROR')
        );
    }
});

/**
 * GET /api/game-history - Retrieve user's game history
 */
app.get('/api/game-history', validateRequest(gameHistorySchema, 'query'), async (req, res) => {
    try {
        const { user_name, limit, include_attempts } = req.query;

        const gameHistory = await getUserGameHistory(user_name, limit);

        // If include_attempts is true, get detailed attempt data
        if (include_attempts && gameHistory.length > 0) {
            const { getSessionEmotionAttempts } = await import('./db/database.js');

            for (const session of gameHistory) {
                session.attempts = await getSessionEmotionAttempts(session.id);
            }
        }

        const response = createSuccessResponse(gameHistory, {
            user_name,
            total_sessions: gameHistory.length,
            query_timestamp: new Date().toISOString()
        });

        res.json(response);
    } catch (error) {
        console.error('Error retrieving game history:', error);
        res.status(500).json(
            createErrorResponse('Failed to retrieve game history', 'INTERNAL_ERROR')
        );
    }
});

/**
 * GET /api/analytics - Get comparative emotion analysis
 */
app.get('/api/analytics', validateRequest(analyticsSchema, 'query'), async (req, res) => {
    try {
        const { user_name, time_range, emotion_filter } = req.query;

        // Get user analytics
        const userAnalytics = user_name ? await getAnalyticsData(user_name) : null;

        // Get global analytics for comparison
        const globalAnalytics = await getAnalyticsData();

        // Process and structure the analytics data
        const analytics = {
            user_performance: userAnalytics,
            global_benchmarks: globalAnalytics,
            comparative_analysis: null
        };

        // Generate comparative analysis if user data exists
        if (userAnalytics && userAnalytics.emotion_performance.length > 0) {
            analytics.comparative_analysis = generateComparativeAnalysis(
                userAnalytics,
                globalAnalytics,
                emotion_filter
            );
        }

        const response = createSuccessResponse(analytics, {
            analysis_type: user_name ? 'user_specific' : 'global_only',
            time_range,
            generated_at: new Date().toISOString()
        });

        res.json(response);
    } catch (error) {
        console.error('Error generating analytics:', error);
        res.status(500).json(
            createErrorResponse('Failed to generate analytics', 'INTERNAL_ERROR')
        );
    }
});

/**
 * Legacy endpoint - keeping for backward compatibility
 * POST /api/openai - Simple OpenAI interaction
 */
app.post('/api/openai', async (req, res) => {
    try {
        const { prompt } = req.body;

        if (!prompt) {
            return res.status(400).json(
                createErrorResponse('Prompt is required', 'MISSING_PROMPT')
            );
        }

        const response = await aiService.callOpenAI(prompt, 50);

        res.json(createSuccessResponse({
            response,
            model: 'gpt-4o-mini'
        }));
    } catch (error) {
        console.error('Error calling OpenAI:', error);
        res.status(500).json(
            createErrorResponse('OpenAI request failed', 'OPENAI_ERROR')
        );
    }
});

/**
 * POST /api/structured-coaching - Get structured coaching response
 * Demonstrates OpenAI structured output with JSON schema validation
 */
app.post('/api/structured-coaching', async (req, res) => {
    try {
        const { 
            target_emotion, 
            detected_emotion, 
            confidence_score, 
            coaching_preference = 'encouraging' 
        } = req.body;

        if (!target_emotion || !detected_emotion || confidence_score === undefined) {
            return res.status(400).json(
                createErrorResponse('target_emotion, detected_emotion, and confidence_score are required', 'MISSING_FIELDS')
            );
        }

        // Create a prompt for structured coaching
        const prompt = `As a ${coaching_preference} emotion coach, provide feedback for a user who:
- Target emotion: ${target_emotion}
- Detected emotion: ${detected_emotion}
- Confidence score: ${confidence_score}%

Provide coaching that is appropriate for their performance level.`;

        // Get structured response using OpenAI's structured output
        const structuredResponse = await aiService.callOpenAIStructured(
            prompt, 
            aiService.getCoachingSchema(),
            200
        );

        res.json(createSuccessResponse({
            structured_coaching: structuredResponse,
            metadata: {
                target_emotion,
                detected_emotion,
                confidence_score,
                coaching_preference,
                response_format: 'json',
                model: 'gpt-4o-mini'
            }
        }));
    } catch (error) {
        console.error('Error generating structured coaching:', error);
        res.status(500).json(
            createErrorResponse('Failed to generate structured coaching', 'STRUCTURED_OUTPUT_ERROR')
        );
    }
});

// --- UTILITY FUNCTIONS ---

/**
 * Generate comparative analysis between user and global performance
 */
function generateComparativeAnalysis(userAnalytics, globalAnalytics, emotionFilter = null) {
    const userEmotions = userAnalytics.emotion_performance;
    const globalEmotions = globalAnalytics.emotion_performance;

    const comparisons = userEmotions.map(userEmotion => {
        const globalEmotion = globalEmotions.find(ge => ge.target_emotion === userEmotion.target_emotion);

        if (!globalEmotion) return null;

        const confidenceDiff = userEmotion.avg_confidence - globalEmotion.avg_confidence;
        const successRateDiff = (userEmotion.successful_attempts / userEmotion.total_attempts) -
            (globalEmotion.successful_attempts / globalEmotion.total_attempts);

        return {
            emotion: userEmotion.target_emotion,
            user_stats: {
                avg_confidence: parseFloat(userEmotion.avg_confidence.toFixed(2)),
                success_rate: parseFloat((userEmotion.successful_attempts / userEmotion.total_attempts * 100).toFixed(2)),
                total_attempts: userEmotion.total_attempts
            },
            global_stats: {
                avg_confidence: parseFloat(globalEmotion.avg_confidence.toFixed(2)),
                success_rate: parseFloat((globalEmotion.successful_attempts / globalEmotion.total_attempts * 100).toFixed(2)),
                total_attempts: globalEmotion.total_attempts
            },
            comparison: {
                confidence_difference: parseFloat(confidenceDiff.toFixed(2)),
                success_rate_difference: parseFloat((successRateDiff * 100).toFixed(2)),
                performance_level: confidenceDiff > 5 ? 'above_average' :
                    confidenceDiff < -5 ? 'below_average' : 'average'
            }
        };
    }).filter(Boolean);

    // Filter by emotion if specified
    if (emotionFilter && emotionFilter.length > 0) {
        return comparisons.filter(comp => emotionFilter.includes(comp.emotion));
    }

    return comparisons;
}

// --- ERROR HANDLING ---

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json(
        createErrorResponse('Internal server error', 'INTERNAL_ERROR')
    );
});

// 404 handler
app.use((req, res) => {
    res.status(404).json(
        createErrorResponse('Endpoint not found', 'NOT_FOUND')
    );
});

// --- SERVER STARTUP ---

async function startServer() {
    try {
        await initializeServices();

        app.listen(port, () => {
            console.log(`Emotion Game Server running at http://localhost:${port}`);
            console.log('API Endpoints:');
            console.log('  POST /api/game-session - Create new game session');
            console.log('  POST /api/emotion-feedback - Submit emotion feedback');
            console.log('  GET  /api/game-history - Get user game history');
            console.log('  GET  /api/analytics - Get comparative analytics');
            console.log('  POST /api/openai - Legacy OpenAI endpoint');
            console.log('  POST /api/structured-coaching - Get structured coaching response');
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer(); 