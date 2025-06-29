# Emotion Challenge Game

A web application that uses your webcam to detect facial expressions and challenges you to match different emotions. Built with real-time face detection, AI coaching, and performance analytics.

## What It Does

This is an interactive game where you try to make specific facial expressions while the app analyzes your face using machine learning. The twist is that you get AI-powered coaching feedback to help improve your emotional expressions, and you can track your progress over time.

The project was built to meet specific technical requirements including a REST API, database integration, and advanced AI prompt engineering techniques.

## Requirements Met

This project satisfies all the required criteria:

- **Express API**: 4 endpoints (2 POST, 2 GET) with proper validation
- **SQLite Database**: 2 tables storing game sessions and emotion attempts
- **AI Text Generation**: Coaching endpoint that generates responses and saves to database
- **Structured Responses**: Consistent JSON format across all endpoints
- **Comparative Analysis**: Performance benchmarking against global averages
- **Prompt Engineering**: Multiple techniques including Chain of Thought and Few-shot Learning
- **Conversation History**: Session-based context for personalized interactions

## Main Features

**Game Mechanics**

- Real-time emotion detection using your webcam
- Progressive challenges where you match target emotions
- Audio feedback when you succeed
- Tutorial to get you started

**AI Coaching**

- Three different coaching styles (encouraging, analytical, challenging)
- Personalized feedback based on your performance
- AI remembers your progress across sessions
- Advanced prompt engineering for better responses

**Analytics**

- Track your improvement over time
- Compare your performance to other users
- Detailed statistics for each emotion type
- Success rates and confidence scoring

**Technical**

- Professional REST API with validation
- SQLite database for data persistence
- Secure API key management
- Comprehensive error handling

## How to Run

You'll need Node.js and an OpenAI API key.

**Setup:**

```bash
git clone <your-repo>
cd emotion-game-masterschool
npm install
echo "OPENAI_API_KEY=your_key_here" > .env
npm start
```

The application includes both the backend API server and serves the frontend files. Once running, open your browser to `http://localhost:3000` and allow webcam access.

## How to Play

1. Enter your name and pick a coaching style
2. Go through the tutorial to learn the basics
3. Try to match the target emotions shown on screen
4. Hold the expression steady until you hit 70% confidence for 0.8 seconds
5. Get AI coaching feedback after each attempt
6. View your progress and compare with others

## API Endpoints

The backend provides these endpoints organized by functionality:

### Requirements Summary

- **2 POST Endpoints:** `/api/game-session`, `/api/emotion-feedback`
- **2 GET Endpoints:** `/api/game-history`, `/api/analytics`
- **Text Generation + DB Update:** `/api/emotion-feedback` generates AI coaching and stores in database
- **Structured Output:** `/api/structured-coaching` demonstrates OpenAI JSON Schema validation
- **Comparative Analysis:** `/api/analytics` provides use-case specific performance comparisons

### Core Game Endpoints

**POST /api/game-session**
Creates a new game session with AI welcome message

_Request:_

```json
{
  "user_name": "your_name",
  "coaching_preference": "encouraging|analytical|challenging"
}
```

_Response:_

```json
{
  "success": true,
  "data": {
    "session_id": 123,
    "welcome_message": "AI generated welcome",
    "coaching_style": "encouraging"
  }
}
```

**POST /api/emotion-feedback**
Submits an emotion attempt and gets AI coaching (Text Generation + DB Update)

_Request:_

```json
{
  "session_id": 123,
  "target_emotion": "happy",
  "detected_emotion": "happy",
  "confidence_score": 85,
  "attempt_duration": 1200,
  "photo_data": "base64_image_optional"
}
```

_Response:_

```json
{
  "success": true,
  "data": {
    "attempt_id": 456,
    "coaching_message": "Great job! Your happiness expression shows...",
    "structured_coaching": {
      "coaching_message": "AI generated coaching",
      "confidence_level": "high",
      "technique_tips": ["tip1", "tip2"],
      "encouragement_level": "supportive"
    },
    "confidence_analysis": {
      "score": 85,
      "target_met": true,
      "improvement_trend": "improving"
    }
  }
}
```

### Analytics Endpoints

**GET /api/game-history**
Retrieves user's historical game data

_Query Parameters:_

```
?user_name=yourname&limit=10&include_attempts=true
```

_Response:_

```json
{
  "success": true,
  "data": [
    {
      "id": 123,
      "user_name": "john",
      "started_at": "2024-01-01T10:00:00Z",
      "total_attempts": 15,
      "avg_confidence": 78.5,
      "attempts": [...]
    }
  ]
}
```

**GET /api/analytics**
Generates comparative performance analysis (Use Case Specific)

_Query Parameters:_

```
?user_name=yourname&time_range=month&emotion_filter=happy,sad
```

_Response:_

```json
{
  "success": true,
  "data": {
    "user_performance": {
      "emotion_performance": [...],
      "overall_stats": {...}
    },
    "global_benchmarks": {...},
    "comparative_analysis": [
      {
        "emotion": "happy",
        "user_stats": {"avg_confidence": 85, "success_rate": 90},
        "global_stats": {"avg_confidence": 75, "success_rate": 80},
        "comparison": {
          "confidence_difference": 10,
          "performance_level": "above_average"
        }
      }
    ]
  }
}
```

### Session Management

**GET /api/session-history**
Gets complete session data including conversation history

_Query Parameters:_

```
?session_id=123
```

_Response:_

```json
{
  "success": true,
  "data": {
    "session": {...},
    "attempts": [...],
    "conversation_history": [
      {"speaker": "bot", "content": "Welcome!", "timestamp": "..."},
      {"speaker": "player", "content": "attempt data", "timestamp": "..."}
    ]
  }
}
```

**POST /api/conversation-message**
Adds a message to conversation history log

_Request:_

```json
{
  "session_id": 123,
  "message_type": "bot_message|player_attempt|system_message",
  "speaker": "bot|player|system",
  "content": "message content",
  "metadata": { "optional": "data" }
}
```

### Advanced Features

**POST /api/structured-coaching**
Demonstrates OpenAI Structured Outputs with JSON Schema validation

_Request:_

```json
{
  "target_emotion": "happy",
  "detected_emotion": "happy",
  "confidence_score": 85,
  "coaching_preference": "encouraging"
}
```

_Response:_

```json
{
  "success": true,
  "data": {
    "structured_coaching": {
      "coaching_message": "Structured AI response",
      "confidence_level": "high",
      "technique_tips": ["tip1", "tip2", "tip3"],
      "encouragement_level": "supportive"
    },
    "metadata": {
      "response_format": "json_schema",
      "model": "gpt-4o-mini"
    }
  }
}
```

**POST /api/openai** _(Legacy)_
Simple OpenAI interaction for backward compatibility

_Request:_

```json
{
  "prompt": "Your prompt here"
}
```

## Database Structure

Two main tables:

**game_sessions** - Tracks each game session

- Basic info like user name, start/end times, scores
- JSON field for flexible session metadata

**emotion_attempts** - Individual emotion tries

- Links to session, stores target/detected emotions
- Confidence scores, timing, AI coaching responses
- Optional photo data

## AI Implementation

The AI coaching uses several prompt engineering techniques:

**Chain of Thought** - Step-by-step analysis:

```
1. Detected: happy at 75% confidence
2. Target: happy
3. Analysis: Good match but could be more expressive
4. Recommendation: Try engaging your eyes more
```

**Few-shot Learning** - Provides examples for each emotion type based on a database of techniques.

**Adaptive Coaching** - Adjusts strategy based on your performance:

- Struggling (< 40%): Supportive with detailed examples
- Improving (40-70%): Specific technical feedback
- Proficient (> 70%): Advanced refinement tips

The AI maintains conversation history so it can reference your past attempts and track improvement trends.

## Project Structure

```
emotion-game-masterschool/
├── config/prompt-engineering.json    # AI coaching settings
├── css/style.css                     # Frontend styles
├── db/
│   ├── database.js                   # Database operations
│   └── emotion_game.db               # SQLite file
├── js/
│   ├── main.js                       # Game logic
│   ├── face-api.js                   # Emotion detection
│   └── unified-messaging.js          # UI helpers
├── models/                           # ML models for face detection
├── utils/
│   ├── ai-service.js                 # OpenAI integration
│   └── validation.js                 # Request validation
├── server.js                         # Express API server
└── package.json
```

## Tech Stack

- **Backend**: Node.js, Express, SQLite
- **Frontend**: Vanilla JavaScript, face-api.js
- **AI**: OpenAI GPT-4o-mini API
- **Validation**: Joi schemas
- **Face Detection**: TensorFlow.js models

## Configuration

The AI coaching behavior is configured in `config/prompt-engineering.json`. You can adjust:

- Coaching persona definitions
- Performance thresholds for adaptive coaching
- Few-shot learning examples
- Conversation history settings

## Development Notes

Some key implementation decisions:

- Used in-memory conversation storage for simplicity (could be moved to database)
- SQLite chosen for easy setup and portability
- Face-api.js provides good balance of accuracy and performance
- Joi validation ensures clean API inputs
- Standardized response format makes frontend integration easier

## Performance

The app processes webcam frames at 30fps for smooth real-time detection. Database queries are optimized for the analytics endpoints since those can get complex with multiple joins and aggregations.

## Security

- Environment variables for API keys
- Input validation on all endpoints
- Parameterized SQL queries prevent injection
- CORS configured appropriately
- Error messages don't leak sensitive info

## Future Ideas

- Voice emotion detection alongside facial
- Multi-user challenges and competitions
- Mobile app version with better camera integration
- More sophisticated ML models for emotion detection
- Integration with therapy or education applications

## Troubleshooting

**Webcam not working**: Make sure you're serving over HTTPS or localhost, browsers block camera access on unsecured connections.

**API errors**: Check your OpenAI API key is set correctly in the .env file.

**Database issues**: Delete the .db file to reset, it will be recreated on next server start.

This project demonstrates full-stack development with AI integration, database design, and modern web APIs. The emotion detection is surprisingly accurate and the AI coaching actually provides useful feedback for improving your expressions.

# Emotion Game Project

## OpenAI Structured Outputs Implementation

This project now uses OpenAI's official **Structured Outputs** feature for guaranteed JSON Schema compliance. For reference: [OpenAI Structured Outputs Documentation](https://platform.openai.com/docs/guides/structured-outputs)

### Key Features

✅ **Enhanced Reliability**: Uses `response_format: { "type": "json_schema" }` with `strict: true`  
✅ **Schema Enforcement**: Guaranteed compliance with predefined JSON schemas  
✅ **Type Safety**: Enum values and required fields are strictly enforced  
✅ **Better Error Handling**: Responses that don't match schema are automatically rejected by OpenAI  
✅ **No Additional Validation Needed**: OpenAI handles schema validation server-side

### Implementation Highlights

#### Before (Legacy JSON Mode)

```javascript
response_format: {
  type: "json_object";
}
// Required additional validation and parsing
// No schema enforcement
// Possible invalid responses
```

#### After (Structured Outputs)

```javascript
response_format: {
    type: "json_schema",
    json_schema: {
        name: "coaching_response",
        strict: true,
        schema: {
            type: "object",
            properties: {
                coaching_message: { type: "string" },
                confidence_level: {
                    type: "string",
                    enum: ["low", "medium", "high"]
                },
                technique_tips: {
                    type: "array",
                    items: { type: "string" }
                },
                encouragement_level: {
                    type: "string",
                    enum: ["supportive", "neutral", "challenging"]
                }
            },
            required: ["coaching_message", "confidence_level", "encouragement_level", "technique_tips"],
            additionalProperties: false
        }
    }
}
```

### Testing

Run the structured output test to see the implementation in action:

```bash
node test-structured-output.js
```

### Schema Benefits

- **Guaranteed Structure**: Every response follows the exact schema
- **Type Safety**: String/array/enum types are enforced
- **Required Fields**: All specified fields must be present
- **No Extra Properties**: `additionalProperties: false` prevents unexpected fields
- **Server-Side Validation**: OpenAI validates before sending response

This implementation ensures 100% reliable structured data for the emotion coaching system.
