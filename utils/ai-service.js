import fs from 'fs';
import path from 'path';

class AIService {
    constructor() {
        this.config = null;
        this.conversationHistories = new Map(); // In-memory storage for conversation contexts
    }

    /**
     * Load prompt engineering configuration
     */
    async loadConfig() {
        if (!this.config) {
            try {
                const configPath = path.resolve(process.cwd(), 'config/prompt-engineering.json');
                const data = await fs.promises.readFile(configPath, 'utf-8');
                this.config = JSON.parse(data);
                console.log('AI Service configuration loaded successfully');
            } catch (error) {
                console.error('Failed to load prompt engineering config:', error);
                this.config = {};
            }
        }
    }

    /**
     * Get persona by type or default to first available
     */
    getPersona(type = 'challenging') {
        if (!this.config?.personas) return { prompt: 'You are an emotion coach.' };
        return this.config.personas.find(p => p.type === type) || this.config.personas[0];
    }

    /**
     * Determine coaching strategy based on performance
     */
    determineCoachingStrategy(averageConfidence) {
        if (!this.config?.techniques?.adaptive_coaching?.enabled) {
            return null;
        }

        const thresholds = this.config.techniques.adaptive_coaching.performance_thresholds;
        const strategies = this.config.techniques.adaptive_coaching.coaching_strategies;

        if (averageConfidence < thresholds.struggling) {
            return strategies.struggling;
        } else if (averageConfidence < thresholds.improving) {
            return strategies.improving;
        } else {
            return strategies.proficient;
        }
    }

    /**
     * Get few-shot examples for an emotion
     */
    getFewShotExamples(targetEmotion) {
        if (!this.config?.techniques?.few_shot_learning?.enabled) {
            return [];
        }

        const examples = this.config.techniques.few_shot_learning.examples[targetEmotion] || [];
        // Return a random example to provide variety
        return examples.length > 0 ? [examples[Math.floor(Math.random() * examples.length)]] : [];
    }

    /**
     * Build Chain of Thought prompt
     */
    buildChainOfThoughtPrompt(analysisData) {
        if (!this.config?.techniques?.chain_of_thought?.enabled) {
            return null;
        }

        const template = this.config.techniques.chain_of_thought.template;
        const { detectedEmotion, confidence, targetEmotion, analysis, recommendation } = analysisData;

        return template
            .replace('{detected_emotion}', detectedEmotion)
            .replace('{confidence}', confidence)
            .replace('{target_emotion}', targetEmotion)
            .replace('{analysis}', analysis)
            .replace('{recommendation}', recommendation);
    }

    /**
     * Get conversation history for a session
     */
    getConversationHistory(sessionId) {
        return this.conversationHistories.get(sessionId) || [];
    }

    /**
     * Add message to conversation history
     */
    addToConversationHistory(sessionId, role, content) {
        if (!this.conversationHistories.has(sessionId)) {
            this.conversationHistories.set(sessionId, []);
        }

        const history = this.conversationHistories.get(sessionId);
        history.push({
            role,
            content,
            timestamp: new Date().toISOString()
        });

        // Keep history within limits
        const maxLength = this.config?.conversation_context?.max_history_length || 10;
        if (history.length > maxLength) {
            history.splice(0, history.length - maxLength);
        }
    }

    /**
     * Analyze user performance from conversation history
     */
    analyzePerformanceFromHistory(sessionId) {
        const history = this.getConversationHistory(sessionId);
        const attempts = history.filter(msg =>
            msg.role === 'user' && msg.content.includes('confidence')
        );

        if (attempts.length === 0) return { average: 0, trend: 'unknown', count: 0 };

        // Extract confidence scores (this is a simplified approach)
        const confidenceScores = attempts.map(attempt => {
            const match = attempt.content.match(/(\d+)%/);
            return match ? parseInt(match[1]) : 0;
        });

        const average = confidenceScores.reduce((sum, score) => sum + score, 0) / confidenceScores.length;

        // Simple trend analysis
        let trend = 'stable';
        if (confidenceScores.length >= 3) {
            const recent = confidenceScores.slice(-3);
            const earlier = confidenceScores.slice(-6, -3);

            if (earlier.length > 0) {
                const recentAvg = recent.reduce((sum, score) => sum + score, 0) / recent.length;
                const earlierAvg = earlier.reduce((sum, score) => sum + score, 0) / earlier.length;

                if (recentAvg > earlierAvg + 5) trend = 'improving';
                else if (recentAvg < earlierAvg - 5) trend = 'declining';
            }
        }

        return { average, trend, count: confidenceScores.length };
    }

    /**
     * Generate emotion coaching with advanced prompt engineering and structured output
     */
    async generateEmotionCoaching(emotionData, sessionId, personaType = 'encouraging') {
        await this.loadConfig();

        const {
            targetEmotion,
            detectedEmotion,
            confidenceScore,
            attemptDuration,
            previousAttempts = []
        } = emotionData;

        // Get persona
        const persona = this.getPersona(personaType);

        // Analyze performance
        const performance = this.analyzePerformanceFromHistory(sessionId);
        const strategy = this.determineCoachingStrategy(performance.average || confidenceScore);

        // Get few-shot examples if appropriate
        const examples = this.getFewShotExamples(targetEmotion);

        // Build comprehensive context
        const contextParts = [];

        // Add conversation history context
        const history = this.getConversationHistory(sessionId);
        if (history.length > 0) {
            contextParts.push("Previous conversation context:");
            contextParts.push(...history.slice(-3).map(msg =>
                `${msg.role}: ${msg.content.substring(0, 100)}...`
            ));
        }

        // Add performance analysis
        if (performance.count > 0) {
            contextParts.push(`\nPerformance analysis: Average confidence ${performance.average.toFixed(1)}%, trend: ${performance.trend}, attempts: ${performance.count}`);
        }

        // Add few-shot examples
        if (examples.length > 0) {
            contextParts.push("\nHelpful examples:");
            contextParts.push(...examples);
        }

        // Create the analysis for Chain of Thought
        const analysis = this.generateAnalysis(detectedEmotion, targetEmotion, confidenceScore, performance);
        const recommendation = this.generateRecommendation(targetEmotion, confidenceScore, strategy);

        // Build Chain of Thought if enabled
        let cotPrompt = '';
        if (this.config.techniques.chain_of_thought.enabled) {
            cotPrompt = this.buildChainOfThoughtPrompt({
                detectedEmotion,
                confidence: confidenceScore,
                targetEmotion,
                analysis,
                recommendation
            });
        }

        // Construct the full prompt
        const fullPrompt = `${persona.prompt}

Current situation:
- Target emotion: ${targetEmotion}
- Detected emotion: ${detectedEmotion}
- Confidence: ${confidenceScore}%
- Attempt duration: ${attemptDuration}ms

${contextParts.join('\n')}

${cotPrompt}

Provide coaching feedback that is ${strategy?.tone || 'supportive'} and uses ${strategy?.approach || 'general guidance'}. Keep response under 100 words and avoid markdown formatting.`;

        try {
            // Use structured output for coaching
            const structuredResponse = await this.callOpenAIStructured(fullPrompt, this.getCoachingSchema());
            
            // Add to conversation history
            this.addToConversationHistory(sessionId, 'user', `Attempted ${targetEmotion}, detected ${detectedEmotion} at ${confidenceScore}%`);
            this.addToConversationHistory(sessionId, 'assistant', structuredResponse.coaching_message);

            return structuredResponse.coaching_message;
        } catch (error) {
            console.error('Failed to generate structured coaching:', error);
            // Fallback to unstructured response
            try {
                const fallbackResponse = await this.callOpenAI(fullPrompt);
                this.addToConversationHistory(sessionId, 'user', `Attempted ${targetEmotion}, detected ${detectedEmotion} at ${confidenceScore}%`);
                this.addToConversationHistory(sessionId, 'assistant', fallbackResponse);
                return fallbackResponse;
            } catch (fallbackError) {
                console.error('Fallback also failed:', fallbackError);
                return this.getFallbackCoaching(targetEmotion, detectedEmotion, confidenceScore);
            }
        }
    }

    /**
     * Generate analysis for Chain of Thought
     */
    generateAnalysis(detected, target, confidence, performance) {
        if (detected === target) {
            return `Successfully expressing ${target} with ${confidence}% confidence. ${performance.trend === 'improving' ? 'Showing consistent improvement.' : ''}`;
        } else {
            return `Expressing ${detected} instead of ${target}. Confidence gap suggests technique refinement needed.`;
        }
    }

    /**
     * Generate recommendation for Chain of Thought
     */
    generateRecommendation(target, confidence, strategy) {
        if (confidence >= 80) {
            return `Continue current approach for ${target}. Focus on consistency.`;
        } else if (confidence >= 60) {
            return `${strategy?.approach === 'supportive_with_examples' ? 'Try the provided examples for' : 'Refine technique for'} ${target}.`;
        } else {
            return `Focus on basic ${target} expression fundamentals. Take your time.`;
        }
    }

    /**
     * Get JSON schema for coaching responses (OpenAI Structured Output compatible)
     */
    getCoachingSchema() {
        return {
            type: "object",
            properties: {
                coaching_message: {
                    type: "string",
                    description: "The main coaching feedback message (under 100 words)"
                },
                confidence_level: {
                    type: "string",
                    enum: ["low", "medium", "high"],
                    description: "Assessment of the user's current confidence level"
                },
                technique_tips: {
                    type: "array",
                    items: {
                        type: "string"
                    },
                    description: "Specific technique suggestions for improvement (maximum 3 tips)"
                },
                encouragement_level: {
                    type: "string",
                    enum: ["supportive", "neutral", "challenging"],
                    description: "The tone of encouragement used"
                }
            },
            required: ["coaching_message", "confidence_level", "encouragement_level", "technique_tips"],
            additionalProperties: false
        };
    }

    /**
     * Call OpenAI API with structured output using JSON Schema (updated implementation)
     */
    async callOpenAIStructured(prompt, schema, maxTokens = 150) {
        // Convert our simple schema to OpenAI's required JSON Schema format
        const jsonSchema = this.convertToOpenAISchema(schema);
        
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: maxTokens,
                temperature: 0.8,
                response_format: {
                    type: "json_schema",
                    json_schema: {
                        name: "coaching_response",
                        strict: true,
                        schema: jsonSchema
                    }
                }
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`OpenAI API Error: ${JSON.stringify(errorData)}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;
        
        try {
            const parsedResponse = JSON.parse(content);
            
            // The response should already be validated by OpenAI's strict mode
            // but we'll do a basic validation as a safety check
            if (!this.validateStructuredResponse(parsedResponse, schema)) {
                console.warn('Response passed OpenAI validation but failed local validation');
            }
            
            return parsedResponse;
        } catch (parseError) {
            console.error('Failed to parse structured response:', parseError);
            throw new Error(`Invalid JSON response: ${parseError.message}`);
        }
    }

    /**
     * Convert our simple schema to OpenAI's JSON Schema format
     */
    convertToOpenAISchema(simpleSchema) {
        // Convert our simplified schema to the full JSON Schema format required by OpenAI
        const jsonSchema = {
            type: "object",
            properties: {},
            required: simpleSchema.required || [],
            additionalProperties: false
        };

        // Convert properties
        if (simpleSchema.properties) {
            for (const [key, prop] of Object.entries(simpleSchema.properties)) {
                jsonSchema.properties[key] = this.convertProperty(prop);
            }
        }

        return jsonSchema;
    }

    /**
     * Convert a single property to OpenAI JSON Schema format
     */
    convertProperty(prop) {
        const converted = {
            type: prop.type
        };

        if (prop.description) {
            converted.description = prop.description;
        }

        if (prop.enum) {
            converted.enum = prop.enum;
        }

        if (prop.type === 'array' && prop.items) {
            converted.items = this.convertProperty(prop.items);
        }

        return converted;
    }

    /**
     * Validate structured response against schema
     */
    validateStructuredResponse(response, schema) {
        // Basic validation - you could use a proper JSON schema validator here
        if (typeof response !== 'object' || response === null) {
            return false;
        }

        // Check required fields
        if (schema.required) {
            for (const field of schema.required) {
                if (!(field in response)) {
                    console.error(`Missing required field: ${field}`);
                    return false;
                }
            }
        }

        // Check enum values
        if (schema.properties) {
            for (const [field, prop] of Object.entries(schema.properties)) {
                if (field in response) {
                    if (prop.enum && !prop.enum.includes(response[field])) {
                        console.error(`Invalid enum value for ${field}: ${response[field]}`);
                        return false;
                    }
                }
            }
        }

        return true;
    }

    /**
     * Call OpenAI API (legacy unstructured method) with retry logic
     */
    async callOpenAI(prompt, maxTokens = 100, retryCount = 0) {
        const maxRetries = 3;
        const baseDelay = 1000; // 1 second

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: maxTokens,
                    temperature: 0.8
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                
                // Check if it's a rate limit error
                if (response.status === 429 && retryCount < maxRetries) {
                    const rateLimitError = errorData.error;
                    console.log(`⏳ Rate limit hit (attempt ${retryCount + 1}/${maxRetries + 1}). Retrying...`);
                    
                    // Extract wait time from error message if available
                    let waitTime = baseDelay * Math.pow(2, retryCount); // Exponential backoff
                    const waitMatch = rateLimitError.message.match(/try again in (\d+)s/);
                    if (waitMatch) {
                        waitTime = Math.max(waitTime, parseInt(waitMatch[1]) * 1000);
                    }
                    
                    console.log(`⏳ Waiting ${waitTime}ms before retry...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    
                    return this.callOpenAI(prompt, maxTokens, retryCount + 1);
                }
                
                // If it's not a rate limit or we've exhausted retries, throw error
                console.error('OpenAI API Error:', errorData);
                throw new Error(`OpenAI API Error: ${JSON.stringify(errorData)}`);
            }

            const data = await response.json();
            return data.choices[0].message.content.trim();
            
        } catch (error) {
            if (error.message.includes('fetch') && retryCount < maxRetries) {
                // Network error, retry with exponential backoff
                const waitTime = baseDelay * Math.pow(2, retryCount);
                console.log(`🌐 Network error (attempt ${retryCount + 1}/${maxRetries + 1}). Retrying in ${waitTime}ms...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                return this.callOpenAI(prompt, maxTokens, retryCount + 1);
            }
            
            throw error; // Re-throw if not retryable or out of retries
        }
    }

    /**
     * Fallback coaching messages
     */
    getFallbackCoaching(target, detected, confidence) {
        const messages = {
            happy: "Try thinking of something that genuinely makes you smile! Let it show in your eyes too.",
            sad: "Let your face naturally relax and think of something melancholic. Don't overdo it.",
            angry: "Focus on tensing your eyebrows and jaw slightly. Think frustrated, not furious.",
            surprised: "Widen your eyes and raise your eyebrows high. Imagine unexpected news!",
            fearful: "Show caution in your eyes and eyebrows. Think startled, not terrified.",
            disgusted: "Wrinkle your nose slightly and think of an unpleasant smell."
        };

        return messages[target] || "Keep practicing! You're getting better at expressing emotions.";
    }

    /**
     * Get fallback welcome message
     */
    getFallbackWelcome(userName) {
        const welcomes = [
            `Welcome to the Emotion Game, ${userName}! Let's explore your emotional range together.`,
            `Hello ${userName}! Ready to test your facial expression skills?`,
            `${userName}, welcome! Time to master the art of emotional expression.`,
            `Greetings ${userName}! Let's see how well you can convey emotions with your face.`
        ];
        return welcomes[Math.floor(Math.random() * welcomes.length)];
    }

    /**
     * Get fallback success message
     */
    getFallbackSuccess(emotion, timeSeconds) {
        const messages = [
            `Excellent work expressing ${emotion}!`,
            `Great job with that ${emotion} expression!`,
            `Well done! You nailed the ${emotion} emotion.`,
            `Perfect ${emotion} expression! Moving on to the next challenge.`
        ];
        return messages[Math.floor(Math.random() * messages.length)];
    }

    /**
     * Get fallback challenge announcement
     */
    getFallbackChallenge(emotion, isFirst) {
        if (isFirst) {
            return `Let's begin! Your first challenge: express ${emotion}!`;
        }
        const announcements = [
            `Your next challenge: ${emotion}!`,
            `Now try expressing: ${emotion}!`,
            `Time for ${emotion}! Show me your best expression.`,
            `Challenge time: ${emotion}!`
        ];
        return announcements[Math.floor(Math.random() * announcements.length)];
    }

    /**
     * Get fallback end game message
     */
    getFallbackEndGame(userName) {
        const endings = [
            `Congratulations ${userName}! You've completed all the emotion challenges.`,
            `Well done ${userName}! You've mastered all the required emotions.`,
            `Excellent work ${userName}! The emotion game is complete.`,
            `${userName}, you've successfully conquered every emotion challenge!`
        ];
        return endings[Math.floor(Math.random() * endings.length)];
    }

    /**
     * Clear conversation history for a session
     */
    clearConversationHistory(sessionId) {
        this.conversationHistories.delete(sessionId);
    }

    /**
     * Get conversation summary for database storage
     */
    getConversationSummary(sessionId) {
        const history = this.getConversationHistory(sessionId);
        return {
            conversation_history: history,
            performance_summary: this.analyzePerformanceFromHistory(sessionId)
        };
    }
}

export default AIService; 