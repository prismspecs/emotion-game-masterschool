/**
 * Debug script for structured output
 */

import dotenv from 'dotenv';
import AIService from './utils/ai-service.js';

// Load environment variables
dotenv.config();

async function debugStructuredOutput() {
    console.log('🔍 Debugging Structured Output...\n');
    
    // Check if API key is loaded
    console.log('API Key loaded:', process.env.OPENAI_API_KEY ? 'Yes' : 'No');
    if (process.env.OPENAI_API_KEY) {
        console.log('API Key starts with:', process.env.OPENAI_API_KEY.substring(0, 10) + '...');
    }
    
    const aiService = new AIService();
    
    try {
        // Test 1: Load config
        console.log('\n1. Testing config loading...');
        await aiService.loadConfig();
        console.log('✅ Config loaded successfully');
        console.log('Config keys:', Object.keys(aiService.config));
        
        // Test 2: Get schema
        console.log('\n2. Testing schema generation...');
        const schema = aiService.getCoachingSchema();
        console.log('✅ Schema generated:', JSON.stringify(schema, null, 2));
        
        // Test 3: Test basic OpenAI call
        console.log('\n3. Testing basic OpenAI call...');
        const basicResponse = await aiService.callOpenAI('Say hello in one word', 10);
        console.log('✅ Basic response:', basicResponse);
        
        // Test 4: Test structured OpenAI call
        console.log('\n4. Testing structured OpenAI call...');
        const prompt = 'As an encouraging emotion coach, provide brief feedback for a user with 85% confidence on happy emotion.';
        const structuredResponse = await aiService.callOpenAIStructured(prompt, schema, 100);
        console.log('✅ Structured response:', JSON.stringify(structuredResponse, null, 2));
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('Stack:', error.stack);
    }
}

debugStructuredOutput(); 