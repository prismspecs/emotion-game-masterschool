# Emotion Game Project Plan

## Project Overview
The Emotion Challenge Game is an interactive web application that uses facial expression recognition to create an engaging game experience. Players are challenged to match specific emotions while receiving real-time feedback on their performance.

## ✅ Masterschool Requirements Compliance

### API Requirements ✅
- **Express API with 4+ endpoints:**
  - `POST /api/game-session` - Create new game session with AI welcome message
  - `POST /api/emotion-feedback` - Submit emotion attempts with AI coaching 
  - `POST /api/openai` - Legacy OpenAI endpoint (backward compatibility)
  - `GET /api/game-history` - Retrieve user's historical game data
  - `GET /api/analytics` - Generate comparative performance analysis

### Database Requirements ✅
- **SQLite Database with 2 Tables:**
  - `game_sessions` - User session management and tracking
  - `emotion_attempts` - Individual emotion detection attempts with AI coaching

### AI Integration Requirements ✅
- **Text Generation Endpoint updating DB:** `/api/emotion-feedback` generates AI coaching and stores in database
- **Structured Output:** All responses use standardized JSON format with success/error handling
- **Conversation History Retention:** AI service maintains conversation context across session
- **Prompt Engineering Techniques (2+):**
  1. **Chain of Thought:** Step-by-step emotion analysis and reasoning
  2. **Few-shot Learning:** Contextual examples for each emotion type
  3. **Adaptive Coaching:** Performance-based coaching strategies (bonus technique)

### Advanced Features ✅
- **Use Case Specific Comparative Analysis:** User performance vs global benchmarks
- **Multiple AI Personas:** Encouraging, analytical, and challenging coaching styles
- **Real-time Performance Tracking:** Trend analysis and improvement suggestions

## Database Schema

### Table: `game_sessions`
```sql
CREATE TABLE game_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_name TEXT NOT NULL,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    emotions_completed INTEGER DEFAULT 0,
    total_score REAL,
    session_data TEXT  -- JSON: conversation_history, coaching_preference, performance_summary
);
```

**Purpose:** Track user game sessions and overall progress
**Key Features:**
- Auto-incrementing session IDs
- Flexible JSON storage for session metadata
- Completion tracking and scoring

### Table: `emotion_attempts`
```sql
CREATE TABLE emotion_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER REFERENCES game_sessions(id),
    target_emotion TEXT NOT NULL,
    detected_emotion TEXT,
    confidence_score REAL,
    attempt_duration INTEGER,
    coaching_provided TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    photo_data TEXT  -- Base64 encoded image data (optional)
);
```

**Purpose:** Store individual emotion detection attempts with AI coaching
**Key Features:**
- Foreign key relationship to game_sessions
- Detailed performance metrics (confidence, duration)
- AI-generated coaching responses
- Optional photo storage for analysis

## Core Features
1. Real-time facial expression detection and analysis
2. Interactive gameplay with emotion matching challenges
3. AI-powered coaching with multiple personas
4. Tutorial system for new users
5. Progressive difficulty system
6. Audio and visual feedback
7. Score tracking and performance metrics
8. Comparative analytics and performance insights

## Technical Architecture

### Frontend
- **Core Game Engine**
  - Emotion detection and analysis using face-api.js
  - Game state management with progression tracking
  - User interface rendering with real-time feedback
  - Audio feedback system for user engagement

- **User Interface Components**
  - Webcam feed display with overlay indicators
  - Emotion matching interface with confidence meters
  - Tutorial overlay with step-by-step guidance
  - Score display and progress indicators
  - Analytics dashboard for performance review

### Backend API Architecture
- **Express.js Server** with middleware stack:
  - CORS for cross-origin requests
  - JSON body parsing with 10MB limit for photo data
  - Joi validation schemas for all endpoints
  - Structured error handling and response formatting

- **Database Layer** (SQLite):
  - Connection management with foreign key constraints
  - Transaction-safe operations
  - Optimized queries for analytics and history retrieval

- **AI Service Layer**:
  - OpenAI API integration with fallback handling
  - Conversation history management (in-memory with planned persistence)
  - Prompt engineering configuration system
  - Performance analysis and trend tracking

## AI Prompt Engineering Implementation

### Configuration-Driven Approach
- **JSON-based prompt configuration** (`config/prompt-engineering.json`)
- **Dynamic persona selection** (encouraging, analytical, challenging)
- **Adaptive coaching strategies** based on user performance levels

### Advanced Techniques

#### 1. Chain of Thought Reasoning
```javascript
"Let me analyze this step by step:
1. Current emotion detected: {detected_emotion} at {confidence}% confidence
2. Target emotion: {target_emotion}
3. Analysis: {analysis}
4. Recommendation: {recommendation}"
```

#### 2. Few-Shot Learning Examples
- Emotion-specific examples stored in configuration
- Random example selection for variety
- Contextual guidance for facial expression techniques

#### 3. Adaptive Coaching (Performance-Based)
- **Struggling (< 40% confidence):** Supportive with detailed examples
- **Improving (40-70% confidence):** Detailed analysis and specific feedback
- **Proficient (> 70% confidence):** Advanced refinement and challenges

### Conversation Context Management
- **Session-based history retention** with configurable limits
- **Performance trend analysis** from conversation patterns
- **Contextual coaching** based on user improvement over time

## Development Milestones

### Phase 1: Core Game Mechanics ✅
- [x] Basic webcam integration with face-api.js
- [x] Face detection and landmark identification
- [x] Real-time emotion recognition system
- [x] Basic game loop with progression tracking
- [x] Tutorial system with guided onboarding

### Phase 2: Backend Integration ✅
- [x] Express.js API server with secure endpoints
- [x] SQLite database with normalized schema
- [x] OpenAI API integration with error handling
- [x] Structured request/response validation
- [x] AI coaching system with prompt engineering

### Phase 3: Advanced Features ✅
- [x] Multiple AI coaching personas
- [x] Conversation history and context retention
- [x] Comparative analytics and benchmarking
- [x] Performance tracking and trend analysis
- [x] Adaptive coaching based on user progress

### Phase 4: Polish and Optimization
- [ ] Performance optimization for real-time processing
- [ ] Enhanced accessibility features
- [ ] Mobile responsiveness improvements
- [ ] Additional emotion sets and difficulty levels
- [ ] Advanced analytics dashboard

## Technical Stack
- **Frontend:** HTML5, CSS3, JavaScript (ES6+), face-api.js
- **Backend:** Node.js, Express.js, SQLite3
- **AI/ML:** OpenAI GPT-4o-mini API
- **Validation:** Joi schema validation
- **Development:** Git, npm, dotenv for configuration

## API Endpoint Documentation

### POST /api/game-session
**Purpose:** Initialize new game session with AI welcome
**Validation:** `gameSessionSchema` (user_name, coaching_preference)
**Response:** Session ID, welcome message, user preferences
**Database:** Inserts into `game_sessions` table

### POST /api/emotion-feedback  
**Purpose:** Process emotion attempts with AI coaching
**Validation:** `emotionFeedbackSchema` (session_id, target/detected emotions, confidence, etc.)
**AI Integration:** Generates personalized coaching using prompt engineering
**Database:** Inserts into `emotion_attempts`, updates `game_sessions`
**Features:** Conversation context, performance analysis, adaptive coaching

### GET /api/game-history
**Purpose:** Retrieve user's historical game data
**Validation:** `gameHistorySchema` (user_name, limit, include_attempts)
**Response:** Session history with optional detailed attempt data
**Database:** Joins `game_sessions` and `emotion_attempts` tables

### GET /api/analytics
**Purpose:** Generate comparative performance analysis
**Validation:** `analyticsSchema` (user_name, time_range, emotion_filter)
**Features:** User vs global benchmarks, emotion-specific performance
**Response:** Structured analytics with comparative insights

### POST /api/openai (Legacy)
**Purpose:** Direct OpenAI API access for backward compatibility
**Validation:** Simple prompt validation
**Response:** Raw AI response with model information

## Performance Considerations
- **Real-time Face Detection:** Optimized for consistent 30fps processing
- **Efficient State Management:** Minimal DOM manipulation, event debouncing
- **API Rate Limiting:** Intelligent caching and request optimization
- **Database Queries:** Indexed queries for analytics and history retrieval
- **Memory Management:** Conversation history limits, garbage collection
- **Asset Optimization:** Compressed models, lazy loading, CDN delivery

## Security Considerations
- **API Key Management:** Environment variables with dotenv
- **Input Validation:** Comprehensive Joi schemas for all endpoints
- **SQL Injection Prevention:** Parameterized queries throughout
- **Data Privacy:** Optional photo storage, session-based data isolation
- **CORS Configuration:** Controlled cross-origin access
- **Error Handling:** Secure error messages without information leakage

## Recent Technical Achievements

### Advanced Prompt Engineering Implementation
**Achievement:** Implemented sophisticated prompt engineering system with multiple techniques:
- **Chain of Thought reasoning** for step-by-step emotion analysis
- **Few-shot learning** with emotion-specific examples
- **Adaptive coaching** that adjusts based on user performance levels
- **Conversation context retention** for personalized interactions

### Comparative Analytics System
**Achievement:** Built comprehensive analytics engine that provides:
- User vs global performance benchmarking
- Emotion-specific success rate analysis
- Performance trend tracking over time
- Confidence score analysis and improvement suggestions

### Database Architecture Optimization
**Achievement:** Designed normalized database schema with:
- Efficient foreign key relationships
- JSON storage for flexible session data
- Optimized queries for analytics generation
- Transaction-safe operations for data integrity

### Structured API Response System
**Achievement:** Implemented consistent API architecture with:
- Standardized success/error response formats
- Comprehensive input validation with detailed error messages
- Middleware-based request processing pipeline
- Graceful error handling and recovery
