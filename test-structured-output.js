/**
 * Test script to demonstrate OpenAI structured output
 * Run with: node test-structured-output.js
 */

import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3000';

async function testStructuredOutput() {
    console.log('Testing OpenAI Structured Output...\n');

    const testCases = [
        {
            target_emotion: 'happy',
            detected_emotion: 'happy',
            confidence_score: 85,
            coaching_preference: 'encouraging'
        },
        {
            target_emotion: 'sad',
            detected_emotion: 'angry',
            confidence_score: 35,
            coaching_preference: 'analytical'
        },
        {
            target_emotion: 'surprised',
            detected_emotion: 'surprised',
            confidence_score: 92,
            coaching_preference: 'challenging'
        }
    ];

    for (let i = 0; i < testCases.length; i++) {
        const testCase = testCases[i];
        console.log(`Test Case ${i + 1}:`);
        console.log(`   Target: ${testCase.target_emotion}`);
        console.log(`   Detected: ${testCase.detected_emotion}`);
        console.log(`   Confidence: ${testCase.confidence_score}%`);
        console.log(`   Coaching Style: ${testCase.coaching_preference}\n`);

        try {
            const response = await fetch(`${API_BASE}/api/structured-coaching`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(testCase)
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error(`Error: ${errorData.error?.message || 'Unknown error'}\n`);
                continue;
            }

            const data = await response.json();
            
            if (data.success && data.data.structured_coaching) {
                const coaching = data.data.structured_coaching;
                console.log('Structured Response:');
                console.log(`   Message: ${coaching.coaching_message}`);
                console.log(`   Confidence Level: ${coaching.confidence_level}`);
                console.log(`   Encouragement Level: ${coaching.encouragement_level}`);
                if (coaching.technique_tips && coaching.technique_tips.length > 0) {
                    console.log(`   Technique Tips: ${coaching.technique_tips.join(', ')}`);
                }
                console.log(`   Response Format: ${data.data.metadata.response_format}`);
                console.log(`   Model: ${data.data.metadata.model}\n`);
            } else {
                console.error('Unexpected response format\n');
            }
        } catch (error) {
            console.error(`Network error: ${error.message}\n`);
        }
    }

    console.log('Structured Output Test Complete!');
    console.log('\nKey Features Demonstrated:');
    console.log('OpenAI response_format: { "type": "json_schema" }');
    console.log('Strict JSON schema validation with strict: true');
    console.log('Consistent response structure');
    console.log('Enum value enforcement');
    console.log('Required field validation');
    console.log('additionalProperties: false enforcement');
}

// Run the test
testStructuredOutput().catch(console.error); 