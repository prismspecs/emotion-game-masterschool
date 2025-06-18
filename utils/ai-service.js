import fetch from 'node-fetch';
import fs from 'fs/promises';
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
        if (this.config) return this.config;

        try {
            const configPath = path.resolve(process.cwd(), 'config/prompt-engineering.json');
            const data = await fs.readFile(configPath, 'utf-8');
            this.config = JSON.parse(data);
            console.log('AI Service configuration loaded successfully');
            return this.config;
        } catch (error) {
            console.error('Failed to load AI service configuration:', error);
            throw error;
        }
    }

    /**
     * Get persona by type or default to first available
     */
    getPersona(type = 'challenging') {
        if (!this.config) throw new Error('Configuration not loaded');

        const persona = this.config.personas.find(p => p.type === type) || this.config.personas[0];
        return persona;
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

        // Limit history length
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
     * Generate emotion coaching with advanced prompt engineering
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
            const response = await this.callOpenAI(fullPrompt);

            // Add to conversation history
            this.addToConversationHistory(sessionId, 'user', `Attempted ${targetEmotion}, detected ${detectedEmotion} at ${confidenceScore}%`);
            this.addToConversationHistory(sessionId, 'assistant', response);

            return response;
        } catch (error) {
            console.error('Failed to generate coaching:', error);
            return this.getFallbackCoaching(targetEmotion, detectedEmotion, confidenceScore);
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
     * Call OpenAI API
     */
    async callOpenAI(prompt, maxTokens = 100) {
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
            throw new Error(`OpenAI API Error: ${JSON.stringify(errorData)}`);
        }

        const data = await response.json();
        return data.choices[0].message.content.trim();
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