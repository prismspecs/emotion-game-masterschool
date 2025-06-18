import Joi from 'joi';

// Validation schema for creating a game session
export const gameSessionSchema = Joi.object({
    user_name: Joi.string().trim().min(1).max(50).required(),
    coaching_preference: Joi.string().valid('encouraging', 'analytical', 'challenging').default('encouraging')
});

// Validation schema for emotion feedback submission
export const emotionFeedbackSchema = Joi.object({
    session_id: Joi.number().integer().positive().required(),
    target_emotion: Joi.string().valid('happy', 'sad', 'angry', 'surprised', 'disgusted', 'fearful').required(),
    detected_emotion: Joi.string().valid('happy', 'sad', 'angry', 'surprised', 'disgusted', 'fearful', 'neutral').required(),
    confidence_score: Joi.number().min(0).max(100).required(),
    attempt_duration: Joi.number().integer().positive().required(),
    photo_data: Joi.string().optional(),
    conversation_context: Joi.array().items(Joi.object({
        role: Joi.string().valid('user', 'assistant').required(),
        content: Joi.string().required(),
        timestamp: Joi.date().optional()
    })).optional()
});

// Validation schema for analytics request
export const analyticsSchema = Joi.object({
    user_name: Joi.string().trim().min(1).max(50).optional(),
    time_range: Joi.string().valid('week', 'month', 'all').default('month'),
    emotion_filter: Joi.array().items(
        Joi.string().valid('happy', 'sad', 'angry', 'surprised', 'disgusted', 'fearful')
    ).optional()
});

// Validation schema for game history request
export const gameHistorySchema = Joi.object({
    user_name: Joi.string().trim().min(1).max(50).required(),
    limit: Joi.number().integer().min(1).max(50).default(10),
    include_attempts: Joi.boolean().default(false)
});

// Standard API response structure
export const createApiResponse = (success, data = null, error = null, metadata = null) => {
    const response = {
        success,
        timestamp: new Date().toISOString(),
        data,
        error,
        metadata
    };
    
    // Remove null fields to keep response clean
    Object.keys(response).forEach(key => {
        if (response[key] === null) {
            delete response[key];
        }
    });
    
    return response;
};

// Error response creator
export const createErrorResponse = (message, code = 'VALIDATION_ERROR', details = null) => {
    return createApiResponse(false, null, {
        code,
        message,
        details
    });
};

// Success response creator
export const createSuccessResponse = (data, metadata = null) => {
    return createApiResponse(true, data, null, metadata);
};

// Validation middleware generator
export function validateRequest(schema, property = 'body') {
    return (req, res, next) => {
        const { error, value } = schema.validate(req[property], { 
            abortEarly: false,
            stripUnknown: true
        });
        
        if (error) {
            const details = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message,
                value: detail.context.value
            }));
            
            return res.status(400).json(
                createErrorResponse('Validation failed', 'VALIDATION_ERROR', details)
            );
        }
        
        // Replace the request property with validated and sanitized data
        req[property] = value;
        next();
    };
}

// Custom validation for session existence
export const validateSessionExists = async (sessionId) => {
    try {
        const { getGameSession } = await import('../db/database.js');
        const session = await getGameSession(sessionId);
        return !!session;
    } catch (error) {
        return false;
    }
}; 