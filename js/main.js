// --- Unified Messaging System Setup ---
let messagingSystem = null;

// Initialize the messaging system when DOM is ready
function initializeMessagingSystem() {
    messagingSystem = new UnifiedMessagingSystem();
}
// --- End Unified Messaging System Setup ---

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize the unified messaging system
    initializeMessagingSystem();

    const EMOTIONS = ['happy', 'sad', 'angry', 'neutral', 'surprised', 'disgusted', 'fearful'];
    const EMOTIONS_PER_GAME = 5;
    let emotionsCompleted = 0;
    let usedEmotions = [];

    const PLAYABLE_EMOTIONS = EMOTIONS.filter(e => e !== 'neutral');
    if (EMOTIONS_PER_GAME > PLAYABLE_EMOTIONS.length) {
        console.error(`Configuration error: EMOTIONS_PER_GAME (${EMOTIONS_PER_GAME}) is greater than the number of available playable emotions (${PLAYABLE_EMOTIONS.length}). The game may not end correctly.`);
    }

    const introHeader = document.querySelector('#introOverlay h1');

    // Conversation logging system
    let currentSessionId = null;
    let gameStartTime = null;
    let conversationHistory = [];

    // Initialize conversation logging
    async function initializeSession(userName) {
        console.log('Initializing session for user:', userName);
        try {
            const response = await fetch('http://localhost:3000/api/game-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    user_name: userName,
                    coaching_preference: 'challenging' // Default preference
                })
            });

            console.log('Session API response status:', response.status);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                console.error('Session creation failed:', errorData);
                throw new Error(`Failed to create session: ${response.status}`);
            }

            const data = await response.json();
            currentSessionId = data.data.session_id;
            gameStartTime = new Date();
            
            console.log('Session created successfully:', {
                sessionId: currentSessionId,
                userName: userName,
                welcomeMessage: data.data.welcome_message?.substring(0, 50) + '...'
            });
            
            // Verify that sessionId was actually set
            if (!currentSessionId) {
                console.error('Session ID is null or undefined after successful API response:', data);
                throw new Error('Session ID not returned from server');
            }
            
            return data.data.welcome_message;
        } catch (error) {
            console.error('Failed to initialize session:', error);
            // Set a fallback session ID so the game can continue with local logging
            console.warn('Creating fallback session for local operation');
            currentSessionId = `fallback_${Date.now()}`;
            gameStartTime = new Date();
            return null;
        }
    }

    // Log conversation message
    async function logConversationMessage(messageType, speaker, content, metadata = null) {
        if (!currentSessionId) {
            console.warn('No session ID available for logging message');
            return;
        }

        console.log('Logging conversation message:', {
            session_id: currentSessionId,
            messageType,
            speaker,
            content: content.substring(0, 50) + '...',
            metadata
        });

        // Always store locally first, regardless of API success
        const localMessage = {
            timestamp: new Date().toISOString(),
            messageType,
            speaker,
            content,
            metadata
        };
        conversationHistory.push(localMessage);
        console.log('Stored message locally. Total messages:', conversationHistory.length);

        // Try to send to server if not using fallback session
        if (!String(currentSessionId).startsWith('fallback_')) {
            try {
                const response = await fetch('http://localhost:3000/api/conversation-message', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        session_id: currentSessionId,
                        message_type: messageType,
                        speaker: speaker,
                        content: content,
                        metadata: metadata
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    console.error('Failed to log conversation message to server:', errorData);
                    return;
                }

                const result = await response.json();
                console.log('Message logged successfully to server:', result);
            } catch (error) {
                console.error('Failed to log conversation message to server:', error);
            }
        } else {
            console.log('Using fallback session - message stored locally only');
        }
    }

    // Log player attempt with timing
    async function logPlayerAttempt(targetEmotion, detectedEmotion, confidence, attemptDuration) {
        const attemptData = {
            target_emotion: targetEmotion,
            detected_emotion: detectedEmotion,
            confidence_score: confidence,
            attempt_duration: attemptDuration
        };

        // Log as conversation message
        await logConversationMessage(
            'player_attempt',
            'player',
            `Attempted ${targetEmotion}, detected ${detectedEmotion} (${confidence.toFixed(1)}% confidence)`,
            {
                ...attemptData,
                timing: {
                    attempt_duration: attemptDuration,
                    game_time: gameStartTime ? Date.now() - gameStartTime.getTime() : null
                }
            }
        );
    }

    // Enhanced messaging function that logs bot responses
    async function getOpenAIResponseWithLogging(prompt, maxTokens, messageType = 'bot_message') {
        const requestSequence = getNextMessageSequence();
        console.log(`Making OpenAI request with sequence ${requestSequence} for ${messageType}`);
        
        const response = await getOpenAIResponse(prompt, maxTokens);
        
        // Check if this response is still valid (sequence hasn't been invalidated)
        if (requestSequence < currentMessageSequence) {
            console.log(`Discarding stale OpenAI response (sequence ${requestSequence} < current ${currentMessageSequence}) for ${messageType}`);
            return null; // Discard stale response
        }
        
        if (response) {
            await logConversationMessage(messageType, 'bot', response, {
                prompt: prompt.substring(0, 200), // Store truncated prompt for context
                response_length: response.length,
                max_tokens: maxTokens,
                sequence: requestSequence
            });
        }

        return response;
    }

    async function getOpenAIResponse(prompt, maxTokens) {
        try {
            const body = { prompt: `${prompt} Do not use markdown.` };
            if (maxTokens) {
                body.max_tokens = maxTokens;
            }

            const response = await fetch('http://localhost:3000/api/openai', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('API Error:', errorData);
                
                // Check if it's a rate limit error for user feedback
                if (response.status === 429) {
                    console.warn('Rate limit hit - the AI is taking a short break. Using backup responses.');
                } else if (response.status >= 500) {
                    console.warn('Server error - using backup responses to keep the game running.');
                }
                
                throw new Error(`API request failed with status ${response.status}`);
            }

            const data = await response.json();
            
            // Log if fallback was used
            if (data.data.fallback_used) {
                console.log('Using backup response due to API limitations');
            }
            
            // The server returns { success: true, data: { response: "...", model: "..." } }
            return data.data.response;
        } catch (error) {
            console.error('Failed to fetch OpenAI response:', error);
            
            // Show user-friendly message for common errors
            if (error.message.includes('429')) {
                console.log('AI services are busy - using backup messages to keep the game flowing smoothly.');
            } else if (error.message.includes('500')) {
                console.log('Using backup responses to ensure uninterrupted gameplay.');
            }
            
            return null; // Return null on error
        }
    }

    async function getOpenAIGreeting(userName) {
        const prompt = `Your new player's name is ${userName}. As the game master, welcome them to the Emotion Game with a short and exciting greeting. Address them by name and keep it under 25 words.`;
        const greeting = await getOpenAIResponse(prompt, 40);
        return greeting || 'Welcome to the Emotion Game!'; // Fallback message
    }

    const videoContainer = document.getElementById('videoContainer');
    const video = document.getElementById('videoElement');
    const overlay = document.getElementById('overlay');
    const canvasContext = overlay.getContext('2d');
    console.log('Canvas context created:', canvasContext ? 'SUCCESS' : 'FAILED');
    const emotionsList = document.getElementById('emotionsList');
    const readout = document.getElementById('readout');

    const startGameButton = document.getElementById('startGame');
    const targetEmotionSpan = document.getElementById('targetEmotion');
    const matchPercentageSpan = document.getElementById('matchPercentage');
    const feedbackMessage = document.getElementById('feedbackMessage');
    const messages = document.getElementById('messages');
    const introOverlay = document.getElementById('introOverlay');

    let targetEmotion = null;
    let lastDetections = [];
    let currentResizedDetections = [];
    let targetEmotionSelected = false;

    let overlayOffsetX = 0;
    let overlayOffsetY = 0;

    let emotionHoldStartTime = null         // when the user first exceeds threshold
    const REQUIRED_HOLD_TIME = 800          // time they must hold emotion (ms)
    const EMOTION_THRESHOLD = 70            // 80% match required

    const DETECTION_INTERVAL = 200; // ms

    // Message sequence tracking to prevent stale messages
    let currentMessageSequence = 0;
    function getNextMessageSequence() {
        return ++currentMessageSequence;
    }
    function invalidateCurrentSequence() {
        console.log(`Invalidating message sequence ${currentMessageSequence}, moving to ${currentMessageSequence + 1}`);
        currentMessageSequence++;
        return currentMessageSequence;
    }

    let tutorialMessages = [
        'Let me explain how this works.',
        'You will be asked to express specific emotions with your face.',
        'Make sure your face is clearly visible in the camera.',
        'When you see a target emotion, try to match it with your expression.',
        'Hold the expression steady until it registers.',
        'The game will now begin.'
    ];
    // tutorialMessages = ["skipping tutorial"];

    let currentTutorialIndex = 0;
    let tutorialTimeoutId = null;

    let userName = '';

    let bypassIntro = false;
    let GAME_MODE = "tutorial";
    let DEBUG_MODE = false; // Toggle with 'D' key for verbose debugging

    let lastCoachingTime = 0;
    const COACHING_INTERVAL = 8000; // ms
    let isCoachingActive = false;
    let emotionAttemptStartTime = null;
    let imageCapture = null; // For high-resolution photos
    let capturedPhotos = []; // Array to store photos for the end gallery

    // Pre-create emotion list items and sliders
    const emotionElements = {};
    EMOTIONS.forEach(emotion => {
        const li = document.createElement('li');
        li.id = `emotion-${emotion}`;

        // add a span class emo-name
        const emo = document.createElement('span');
        emo.textContent = emotion;
        emo.classList.add('emo-name');
        li.appendChild(emo);

        // add a span class emo-percentage
        const percentage = document.createElement('span');
        percentage.textContent = '0.00%';
        percentage.classList.add('emo-percentage');
        li.appendChild(percentage);

        emotionsList.appendChild(li);
        emotionElements[emotion] = { li };
    });

    // Load models
    await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri('./models'),
        faceapi.nets.faceLandmark68Net.loadFromUri('./models'),
        faceapi.nets.faceRecognitionNet.loadFromUri('./models'),
        faceapi.nets.faceExpressionNet.loadFromUri('./models')
    ]);
    // startVideo(); // Remove or comment out this line

    async function startVideo() {
        console.log("Entering startVideo function");
        try {
            console.log("Enumerating devices...");
            const devices = await navigator.mediaDevices.enumerateDevices();
            console.log("Devices enumerated:", devices);
            const videoDevices = devices.filter(device => device.kind === 'videoinput');
            console.log("Video devices found:", videoDevices);

            if (videoDevices.length === 0) {
                console.error('No video input devices found');
                throw new Error('No video input devices found');
            }

            // flip overlay and videoElement horizontally
            video.style.transform = 'scaleX(-1)';
            overlay.style.transform = 'scaleX(-1)';
            console.log("Video and overlay flipped horizontally");

            const constraints = {
                video: {
                    facingMode: 'user', // prefer front camera
                    aspectRatio: { ideal: 16 / 9 }
                }
            };
            console.log("Requesting user media with constraints:", constraints);
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            console.log("Got stream:", stream);
            video.srcObject = stream;
            console.log("Video source object set");

            // Initialize ImageCapture for high-res photos if supported
            const videoTrack = stream.getVideoTracks()[0];
            if (typeof ImageCapture !== 'undefined') {
                try {
                    imageCapture = new ImageCapture(videoTrack);
                    console.log('ImageCapture initialized for high-resolution photos.');
                } catch (e) {
                    console.error('Error creating ImageCapture:', e);
                    imageCapture = null; // Ensure it's null on failure
                }
            } else {
                console.warn('ImageCapture API not supported. Falling back to canvas capture for photos.');
            }

            // Return a promise that resolves when video is ready
            return new Promise((resolve, reject) => {
                video.onloadedmetadata = () => {
                    console.log(`Video metadata loaded. Camera resolution: ${video.videoWidth}x${video.videoHeight}`);

                    resizeOverlayToVideo();
                    console.log('Overlay resized. Overlay dimensions:', overlay.width, 'x', overlay.height);

                    // get the overlay's offset
                    const overlayRect = overlay.getBoundingClientRect();
                    overlayOffsetX = overlayRect.left;
                    overlayOffsetY = overlayRect.top;
                    console.log('Overlay offset:', overlayOffsetX, overlayOffsetY);

                    // start detection loop immediately
                    startDetectionLoop();

                    // start animation loop immediately
                    requestAnimationFrame(animate);
                    console.log('Face detection and animation started immediately');

                    resolve();
                };

                video.onerror = (e) => {
                    console.error("Video element error:", e);
                    reject(e);
                };
            });

        } catch (err) {
            console.error('Error in startVideo:', err);
            throw err;
        }
    }

    function resizeOverlayToVideo() {
        // Get container size
        const containerWidth = videoContainer.clientWidth;
        const containerHeight = videoContainer.clientHeight;
        // Get video intrinsic size
        const videoAspect = video.videoWidth / video.videoHeight;
        const containerAspect = containerWidth / containerHeight;
        let displayWidth, displayHeight, offsetX, offsetY;
        if (videoAspect > containerAspect) {
            // Video is wider than container: height matches, width overflows
            displayHeight = containerHeight;
            displayWidth = containerHeight * videoAspect;
            offsetX = (containerWidth - displayWidth) / 2;
            offsetY = 0;
        } else {
            // Video is taller than container: width matches, height overflows
            displayWidth = containerWidth;
            displayHeight = containerWidth / videoAspect;
            offsetX = 0;
            offsetY = (containerHeight - displayHeight) / 2;
        }
        // Set overlay size and position
        overlay.width = displayWidth;
        overlay.height = displayHeight;
        overlay.style.width = displayWidth + 'px';
        overlay.style.height = displayHeight + 'px';
        overlay.style.left = offsetX + 'px';
        overlay.style.top = offsetY + 'px';
        overlay.style.position = 'absolute';
        faceapi.matchDimensions(overlay, { width: displayWidth, height: displayHeight });
    }

    // event listener for resizing window
    window.addEventListener('resize', () => {
        resizeOverlayToVideo();
        // get the overlay's offset
        const overlayRect = overlay.getBoundingClientRect();
        overlayOffsetX = overlayRect.left;
        overlayOffsetY = overlayRect.top;
    });

    function startDetectionLoop() {
        const detectionOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
        setInterval(async () => {
            const detections = await faceapi.detectAllFaces(video, detectionOptions)
                .withFaceLandmarks()
                .withFaceExpressions();
            if (detections.length > 0) {
                lastDetections = detections;
            }
            // Use overlay's current size for resizing
            currentResizedDetections = faceapi.resizeResults(lastDetections, { width: overlay.width, height: overlay.height });
        }, DETECTION_INTERVAL);
    }

    function drawDetectionsWithoutScore(canvas, detections) {
        const ctx = canvas.getContext('2d');
        ctx.strokeStyle = 'yellow';
        ctx.lineWidth = 3;

        detections.forEach(detection => {
            const box = detection.detection.box;
            ctx.strokeRect(box.x, box.y, box.width, box.height);
        });
    }

    function animate() {
        // clear the canvas
        canvasContext.clearRect(0, 0, overlay.width, overlay.height);

        if (currentResizedDetections && currentResizedDetections.length > 0) {
            // **DO NOT** modify currentResizedDetections with screen offsets here.
            // Detections are already relative to the overlay canvas dimensions.

            // Draw the detection box without the score
            drawDetectionsWithoutScore(overlay, currentResizedDetections);

            const faceLandmarksConfig = {
                drawPoints: false,
                pointSize: 2,
                pointColor: '#fff',
                drawLines: true,
                lineColor: '#fff',
                lineWidth: 2
            };

            faceapi.draw.drawFaceLandmarks(overlay, currentResizedDetections, faceLandmarksConfig);

            // position the readout div on top of face, centered
            const facebox = currentResizedDetections[0].detection.box;

            // Get the overlay's calculated offset (from resizeOverlayToVideo)
            const overlayScreenX = parseFloat(overlay.style.left) || 0;
            const overlayScreenY = parseFloat(overlay.style.top) || 0;

            // Position readout relative to the screen, considering mirrored video and overlay
            // The overlay (and video) is mirrored with transform: scaleX(-1)
            // The readout needs to be positioned based on the *visual* position of the facebox on screen.
            // facebox.x is from the left of the overlay canvas.
            // In a mirrored view, if overlay is full width, visual left is `overlay.offsetWidth - (facebox.x + facebox.width)`

            // Calculate the visual center of the facebox on the overlay canvas (mirrored view)
            const visualFaceboxCenterX_onOverlay = overlay.width - (facebox.x + facebox.width / 2);

            // Convert this to screen coordinates
            const readoutScreenX = overlayScreenX + visualFaceboxCenterX_onOverlay - (readout.offsetWidth / 2);
            const readoutScreenY = overlayScreenY + facebox.y + facebox.height;

            readout.style.left = `${readoutScreenX}px`;
            readout.style.top = `${readoutScreenY}px`;
        }

        // Update emotions based on latest detections
        // updateEmotions needs to be async if takePhoto is awaited inside it.
        // Ensure this call doesn't cause issues if updateEmotions is now async.
        updateEmotions(currentResizedDetections);

        // Request the next frame
        requestAnimationFrame(animate);
    }

    function lerp(start, end, amt) {
        return start + (end - start) * amt;
    }

    async function updateEmotions(detections) {
        if (detections && detections.length > 0) {
            lastDetections = detections; // Always update with the latest detection
            const emotions = detections[0].expressions;
            
            // Periodic detection health check (only in debug mode)
            if (DEBUG_MODE && Math.random() < 0.05) { // 5% chance to log detection info when debugging
                console.log(`DETECTION HEALTH: ${detections.length} faces detected, game mode: ${GAME_MODE}`);
            }

            if (GAME_MODE == "game" && targetEmotion && !targetEmotionSelected) {
                const matchPercentage = (emotions[targetEmotion] || 0) * 100;
                matchPercentageSpan.textContent = `${matchPercentage.toFixed(2)}%`;

                // Add periodic debugging for stuck emotions (only in debug mode)
                if (DEBUG_MODE && Math.random() < 0.1) { // 10% chance to log debug info when debugging
                    console.log(`EMOTION DEBUG: target="${targetEmotion}", match=${matchPercentage.toFixed(1)}%, selected=${targetEmotionSelected}, holdStart=${emotionHoldStartTime}`);
                    console.log(`All emotions:`, Object.keys(emotions).map(e => `${e}:${(emotions[e]*100).toFixed(1)}%`).join(', '));
                }

                // Check if matchPercentage is above the threshold
                if (matchPercentage >= EMOTION_THRESHOLD) {
                    // If we've not started the "hold timer" yet, set it now
                    if (emotionHoldStartTime === null) {
                        emotionHoldStartTime = performance.now();
                    } else {
                        // Calculate how long we've held above threshold
                        const elapsed = performance.now() - emotionHoldStartTime;
                        if (elapsed >= REQUIRED_HOLD_TIME) {
                            // If a message is currently playing (e.g., the challenge announcement or coaching), stop it.
                            if (messagingSystem.isPlaying) {
                                messagingSystem.stop();
                            }

                            targetEmotionSelected = true; // Set early to prevent re-entry
                            readout.style.display = 'none'; // Hide readout immediately on success

                            // Take photo immediately on success, but don't wait for it.
                            captureAndStorePhoto();

                            const audio = new Audio('/sounds/ding.wav');
                            audio.play();

                            const timeToAchieve = (performance.now() - emotionAttemptStartTime) / 1000;
                            const attemptDurationMs = performance.now() - emotionAttemptStartTime;

                            // Log successful player attempt
                            const dominantEmotion = Object.keys(lastDetections[0].expressions).reduce((a, b) => 
                                lastDetections[0].expressions[a] > lastDetections[0].expressions[b] ? a : b
                            );
                            const confidence = lastDetections[0].expressions[targetEmotion] * 100;
                            await logPlayerAttempt(targetEmotion, dominantEmotion, confidence, attemptDurationMs);

                            let prompt;
                            const willBeLastEmotion = emotionsCompleted + 1 >= EMOTIONS_PER_GAME;
                            
                            if (willBeLastEmotion) {
                                // Final challenge completion message
                                prompt = `The player has just completed their FINAL emotion challenge "${targetEmotion}" in ${timeToAchieve.toFixed(1)} seconds, mastering all required emotions. Give a dramatic, triumphant message acknowledging their complete victory. Under 25 words.`;
                            } else {
                                // Regular challenge completion message
                                prompt = `The player just succeeded at expressing "${targetEmotion}". Give a short, excited, congratulatory message for mastering it in ${timeToAchieve.toFixed(1)} seconds. Do NOT mention what is next. Keep it under 20 words.`;
                            }
                            
                                        const congratsMessage = await getOpenAIResponseWithLogging(prompt, 40, 'success_message');

            // Only play if we got a valid (non-stale) response
            if (congratsMessage) {
                await messagingSystem.playMessage(congratsMessage);
            } else {
                                            console.log('Using fallback success message due to stale/missing response');
                await messagingSystem.playMessage('Well done!');
            }

                            emotionsCompleted++;
                            usedEmotions.push(targetEmotion);

                            console.log(`EMOTION CONQUERED: "${targetEmotion}" Count: ${emotionsCompleted}/${EMOTIONS_PER_GAME} | Used: [${usedEmotions.join(', ')}]`);

                            if (emotionsCompleted >= EMOTIONS_PER_GAME) {
                                console.log(`VICTORY CONDITIONS MET! Game ending with ${emotionsCompleted}/${EMOTIONS_PER_GAME} emotions!`);
                                runEnd();
                            } else {
                                console.log(`ADVANCING TO NEXT TARGET Progress: ${emotionsCompleted}/${EMOTIONS_PER_GAME}`);
                                // A brief pause before selecting and announcing the next one.
                                await new Promise(resolve => setTimeout(resolve, 1500));
                                await selectNewTargetEmotion();
                            }
                        }
                    }
                } else {
                    // If we dropped below threshold, reset the hold timer
                    emotionHoldStartTime = null;

                    // Coaching logic
                    const now = performance.now();
                    if (now - lastCoachingTime > COACHING_INTERVAL && !isCoachingActive && lastDetections.length > 0) {
                        isCoachingActive = true;
                        lastCoachingTime = now;

                        const expressions = lastDetections[0].expressions;
                        const dominantEmotion = Object.keys(expressions).reduce((a, b) => expressions[a] > expressions[b] ? a : b);

                        let prompt;
                        const isLastChallenge = emotionsCompleted === EMOTIONS_PER_GAME - 1;
                        
                        if (isLastChallenge) {
                            // Special prompts for the final challenge
                            if (dominantEmotion !== targetEmotion) {
                                prompt = `This is the final test. The player is attempting "${targetEmotion}" but showing "${dominantEmotion}". Give them a dramatic, intense final warning to correct their expression. Under 25 words.`;
                            } else {
                                prompt = `This is the final challenge. The player is showing "${targetEmotion}" but needs more intensity to complete their ultimate test. Give them a climactic, urgent push. Under 15 words.`;
                            }
                        } else {
                            // Regular coaching prompts
                            if (dominantEmotion !== targetEmotion) {
                                prompt = `The player is trying to show "${targetEmotion}", but their expression is reading as "${dominantEmotion}". Give them a short, cryptic, and darkly humorous tip (under 25 words) to help them adjust their face.`;
                            } else {
                                prompt = `The player is on the right track showing "${targetEmotion}", but they need to make the expression stronger. Give them a very short, menacing, and cryptic tip (under 15 words) to intensify it.`;
                            }
                        }

                        const coachingMessage = await getOpenAIResponseWithLogging(prompt, 50, 'coaching_message');

                        // Only play coaching message if it's valid and game is still active
                        if (coachingMessage && GAME_MODE === "game") {
                            await messagingSystem.playMessage(coachingMessage);
                        } else if (!coachingMessage) {
                            console.log('Skipping coaching message due to stale/missing response');
                        } else {
                            console.log('Skipping coaching message - game mode changed');
                        }

                        isCoachingActive = false;
                    }
                }
            }
        } else if (lastDetections.length > 0) {
            // Optionally handle "no face detected" logic here
        }
    }

    async function selectNewTargetEmotion() {
        console.log(`TARGET SELECTION INITIATED Used: [${usedEmotions.join(', ')}] | Completed: ${emotionsCompleted}`);
        const availableEmotions = PLAYABLE_EMOTIONS.filter(emotion => !usedEmotions.includes(emotion));
        console.log(`EMOTION POOL: [${availableEmotions.join(', ')}]`);
        targetEmotion = availableEmotions[Math.floor(Math.random() * availableEmotions.length)];
        console.log(`NEW TARGET LOCKED: "${targetEmotion}"`);

        // Update UI and state *immediately* so the game can proceed
        // even if the announcement has issues.
        targetEmotionSpan.textContent = targetEmotion;
        matchPercentageSpan.textContent = '0%';
        feedbackMessage.textContent = '';
        targetEmotionSelected = false;
        emotionHoldStartTime = null; // Reset hold timer
        emotionAttemptStartTime = performance.now();
        lastCoachingTime = performance.now(); // Reset coaching timer for a grace period
        readout.style.display = 'block';
        
        console.log(`STATE RESET: targetEmotion="${targetEmotion}", targetEmotionSelected=${targetEmotionSelected}, emotionHoldStartTime=${emotionHoldStartTime}`);

        // Announce the new emotion
        let announcementPrompt;
        if (usedEmotions.length === 0) {
            announcementPrompt = `This is the first challenge. Announce the emotion "${targetEmotion}" as the starting test. Do not welcome the player to the game, since that has already happened. Keep it short, under 15 words. For example: "Let's begin. Your first challenge: ${targetEmotion}!"`;
        } else {
            announcementPrompt = `Now, challenge the player to express the emotion: "${targetEmotion}". Keep the message short, engaging, and under 15 words. For example: "Your next challenge: ${targetEmotion}!"`;
        }
        const announcementMessage = await getOpenAIResponseWithLogging(announcementPrompt, 30, 'challenge_announcement');
        
        // Only play if we got a valid (non-stale) response
        if (announcementMessage) {
            await messagingSystem.playMessage(announcementMessage);
        } else {
            console.log('Using fallback announcement message due to stale/missing response');
            await messagingSystem.playMessage(`Now try: ${targetEmotion}`);
        }

        // Ensure this call doesn't cause issues if updateEmotions is now async.
        updateEmotions(currentResizedDetections);

        // Request the next frame
        requestAnimationFrame(animate);
    }

    // when they press submit after entering name (or press enter)
    document.getElementById('nameField').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            document.getElementById('nameSubmit').click();
        }
    });
    document.getElementById('nameSubmit').addEventListener('click', async () => {
        // Prime the audio context on user interaction
        messagingSystem.primeAudioContext();

        console.log("nameSubmit clicked");
        const nameInput = document.getElementById('nameField');
        userName = nameInput.value.trim() || 'Guest';

        messagingSystem.setLoadingMessage('Testing audio system...');
        
        // Test if TTS is working
        const ttsWorking = await messagingSystem.testSpeechSynthesis();
        if (!ttsWorking) {
            console.warn('TTS test failed - audio may not work properly');
            messagingSystem.setLoadingMessage('Audio test failed - continuing with text-only mode');
            await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
            console.log('TTS test passed - audio should work');
        }

        messagingSystem.setLoadingMessage('Loading...');
        introOverlay.style.display = 'none';
        console.log("Hiding introOverlay:", introOverlay);

        // Start video immediately so it's ready during greeting
        messagingSystem.setLoadingMessage('Starting camera...');
        try {
            await startVideo();
            console.log("Video started successfully - face detection should be active now");
            messagingSystem.setLoadingMessage('Camera ready! Face detection active.');
        } catch (error) {
            console.error("Error starting video:", error);
            messagingSystem.setLoadingMessage('Error starting camera. Please check console.');
            return;
        }

        messagingSystem.setLoadingMessage('Connecting to OpenAI server and loading face tracking models...');
        
        // Initialize session and get greeting
        const greeting = await initializeSession(userName);

        if (greeting) {
            console.log('Session initialized successfully, currentSessionId:', currentSessionId);
            // Log and play greeting message
            await logConversationMessage('welcome_message', 'bot', greeting, {
                user_name: userName,
                session_initialized: true
            });
            await messagingSystem.playMessage(greeting);
        } else {
            console.warn('Session initialization failed, currentSessionId:', currentSessionId);
            // Fallback if greeting fails
            const fallbackGreeting = `Welcome to the Emotion Game, ${userName}!`;
            await logConversationMessage('welcome_message', 'bot', fallbackGreeting, {
                user_name: userName,
                fallback: true
            });
            await messagingSystem.playMessage(fallbackGreeting);
        }

        // Clear message and start tutorial after greeting is done
        messagingSystem.clearMessage();
        console.log("Greeting finished: Starting tutorial...");
        
        // Add a small delay to ensure messaging system is ready
        setTimeout(() => {
            runTutorial();
        }, 500);
    });

    // Show tutorial messages one by one using the unified messaging system
    async function showNextMessage() {
        // Check if tutorial was skipped (game mode changed)
        if (GAME_MODE !== "tutorial") {
            console.log('Tutorial was skipped, stopping showNextMessage');
            return;
        }

        if (currentTutorialIndex >= tutorialMessages.length) {
            // All messages are done, or the tutorial was skipped. Start the game.
            console.log('Tutorial completed naturally, starting game');
            runGame();
            return;
        }

        const currentMessage = tutorialMessages[currentTutorialIndex];
        currentTutorialIndex++;

        console.log(`Playing tutorial message ${currentTutorialIndex}/${tutorialMessages.length}: ${currentMessage.substring(0, 30)}...`);

        // Log tutorial message
        await logConversationMessage('tutorial_message', 'bot', currentMessage, {
            tutorial_step: currentTutorialIndex,
            total_steps: tutorialMessages.length
        });

        // Only play if tutorial is still active (not skipped)
        if (GAME_MODE === "tutorial") {
            await messagingSystem.playMessage(currentMessage);
        } else {
            console.log('Skipping tutorial message playback - tutorial was skipped');
            return;
        }

        // After the message has played, check if tutorial is still active and we should continue
        if (GAME_MODE === "tutorial" && currentTutorialIndex < tutorialMessages.length) {
            console.log(`Scheduling next tutorial message in 1 second`);
            tutorialTimeoutId = setTimeout(showNextMessage, 1000);
        } else if (GAME_MODE === "tutorial") {
            // We've finished the last message and tutorial is still active
            console.log('Tutorial completed, starting game');
            runGame();
        }
        // If GAME_MODE is no longer "tutorial", we were skipped and should do nothing
    }

    function runTutorial() {
        GAME_MODE = "tutorial";
        currentTutorialIndex = 0; // Reset index for skippable tutorial
        showNextMessage(); // Now calls the globally (within DOMContentLoaded) defined showNextMessage
    }

    async function runGame() {
        GAME_MODE = "game";
        await selectNewTargetEmotion();
    }

    async function runEnd() {
        console.log(`GAME TERMINATION SEQUENCE ACTIVATED Final Score: ${emotionsCompleted} | Conquered: [${usedEmotions.join(', ')}]`);
        readout.style.display = 'none';
        GAME_MODE = "end";

        const endPrompt = `The player has successfully completed all emotion challenges. Deliver a final, conclusive, and slightly menacing message to them, remarking on their success and the completion of the game. Address them by their name, ${userName}. Keep it under 30 words.`;
        const endMessage = await getOpenAIResponseWithLogging(endPrompt, 60, 'end_game_message');

        // Update session completion
        if (currentSessionId) {
            try {
                await fetch('http://localhost:3000/api/game-session', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        session_id: currentSessionId,
                        completed_at: new Date().toISOString(),
                        emotions_completed: emotionsCompleted,
                        total_score: emotionsCompleted / EMOTIONS_PER_GAME * 100
                    })
                });
            } catch (error) {
                console.error('Failed to update session completion:', error);
            }
        }

        // Only play if we got a valid (non-stale) response and game is still ending
        if (endMessage && GAME_MODE === "end") {
            await messagingSystem.playMessage(endMessage);
        } else if (GAME_MODE === "end") {
            console.log('Using fallback end message due to stale/missing response');
            await messagingSystem.playMessage('The game is over. You have survived.');
        } else {
            console.log('Skipping end message - game mode changed');
        }

        // Fade the screen to black after the final message
        setTimeout(() => {
            console.log('Starting fade to black...');
            const fadeOverlay = document.getElementById('fadeOverlay');
            console.log('fadeOverlay element:', fadeOverlay);
            if (fadeOverlay) {
                console.log('Applying fade transition...');
                fadeOverlay.style.transition = 'opacity 2s ease-in-out';
                fadeOverlay.style.opacity = '1';
                // After fade is complete, show the gallery
                console.log('Scheduling gallery display in 2 seconds...');
                setTimeout(() => {
                    console.log('About to show photo gallery...');
                    showPhotoGallery();
                }, 2000);
            } else {
                console.error('fadeOverlay element not found, showing gallery directly');
                showPhotoGallery();
            }
        }, 2000);
    }

    async function showPhotoGallery() {
        console.log('showPhotoGallery() called');
        const gallery = document.getElementById('photoGallery');
        const container = document.getElementById('galleryContainer');
        console.log('Gallery element:', gallery);
        console.log('Container element:', container);
        
        if (!gallery) {
            console.error('photoGallery element not found!');
            return;
        }
        
        if (!container) {
            console.error('galleryContainer element not found!');
            return;
        }
        
        container.innerHTML = ''; // Clear previous items

        // Create main gallery layout
        const galleryLayout = document.createElement('div');
        galleryLayout.className = 'gallery-layout';
        galleryLayout.style.cssText = `
            display: flex;
            width: 100%;
            height: 100vh;
            background: #000;
            color: #fff;
        `;

        // Create photo section
        const photoSection = document.createElement('div');
        photoSection.className = 'photo-section';
        photoSection.style.cssText = `
            flex: 1;
            padding: 20px;
            overflow-y: auto;
        `;

        const photoTitle = document.createElement('h2');
        photoTitle.textContent = 'Your Emotion Journey';
        photoTitle.style.cssText = `
            text-align: center;
            margin-bottom: 20px;
            color: #fff;
        `;
        photoSection.appendChild(photoTitle);

        const photoGrid = document.createElement('div');
        photoGrid.style.cssText = `
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
        `;

        console.log('Total captured photos:', capturedPhotos.length);
        console.log('Captured photos sample:', capturedPhotos.slice(0, 2));

        if (capturedPhotos.length === 0) {
            const noPhotosMsg = document.createElement('div');
            noPhotosMsg.style.cssText = 'color: #ffa726; text-align: center; padding: 20px;';
            noPhotosMsg.textContent = 'No photos were captured during the game';
            photoGrid.appendChild(noPhotosMsg);
        }

        capturedPhotos.forEach((photo, index) => {
            console.log('Processing photo', index + 1, 'for emotion:', photo.emotion);
            const item = document.createElement('div');
            item.className = 'gallery-item';
            item.style.cssText = `
                background: #333;
                border-radius: 8px;
                padding: 10px;
                text-align: center;
            `;

            const img = document.createElement('img');
            img.src = photo.dataURL;
            img.style.cssText = `
                width: 100%;
                height: 150px;
                object-fit: cover;
                border-radius: 4px;
                margin-bottom: 10px;
            `;

            const label = document.createElement('span');
            label.className = 'label';
            label.textContent = photo.emotion;
            label.style.cssText = `
                display: block;
                font-weight: bold;
                margin-bottom: 8px;
                color: #fff;
            `;

            const saveBtn = document.createElement('button');
            saveBtn.className = 'save-btn';
            saveBtn.textContent = 'Save';
            saveBtn.style.cssText = `
                background: #4CAF50;
                color: white;
                border: none;
                padding: 5px 15px;
                border-radius: 4px;
                cursor: pointer;
            `;
            saveBtn.onclick = () => {
                downloadPhoto(photo.dataURL, `${photo.emotion}.jpg`);
            };

            item.appendChild(img);
            item.appendChild(label);
            item.appendChild(saveBtn);
            photoGrid.appendChild(item);
        });

        photoSection.appendChild(photoGrid);

        // Create conversation section
        const conversationSection = document.createElement('div');
        conversationSection.className = 'conversation-section';
        conversationSection.style.cssText = `
            flex: 1;
            padding: 20px;
            background: #1a1a1a;
            overflow-y: auto;
            border-left: 2px solid #333;
        `;

        const conversationTitle = document.createElement('h2');
        conversationTitle.textContent = 'Conversation History';
        conversationTitle.style.cssText = `
            text-align: center;
            margin-bottom: 20px;
            color: #fff;
        `;
        conversationSection.appendChild(conversationTitle);

        // Fetch and display conversation history
        console.log('Checking currentSessionId at gallery display:', currentSessionId);
        
        if (currentSessionId) {
            console.log('Fetching conversation history for session:', currentSessionId);
            
            // Check if this is a fallback session
            if (String(currentSessionId).startsWith('fallback_')) {
                console.log('Using fallback session, displaying local conversation history');
                
                // Show local conversation history if available
                console.log('Local conversationHistory length:', conversationHistory ? conversationHistory.length : 'undefined');
                console.log('Local conversationHistory sample:', conversationHistory ? conversationHistory.slice(0, 2) : 'undefined');
                
                if (conversationHistory && conversationHistory.length > 0) {
                    console.log('Displaying local conversation history with', conversationHistory.length, 'messages');
                    const conversationLog = document.createElement('div');
                    conversationLog.className = 'conversation-log';
                    conversationLog.style.cssText = `
                        display: flex;
                        flex-direction: column;
                        gap: 10px;
                    `;

                    conversationHistory.forEach((message, index) => {
                        console.log('Processing message', index + 1, ':', message);
                        const messageDiv = document.createElement('div');
                        messageDiv.className = `message ${message.speaker}`;
                        messageDiv.style.cssText = `
                            padding: 10px;
                            border-radius: 8px;
                            margin-bottom: 8px;
                            ${message.speaker === 'bot' ? 
                                'background: #2d5a87; margin-right: 20px;' : 
                                'background: #4a4a4a; margin-left: 20px;'
                            }
                        `;

                        const header = document.createElement('div');
                        header.style.cssText = `
                            font-size: 12px;
                            color: #ccc;
                            margin-bottom: 5px;
                        `;
                        
                        const timestamp = new Date(message.timestamp).toLocaleTimeString();
                        const messageTypeLabel = (message.messageType || 'unknown').replace('_', ' ').toUpperCase();
                        header.textContent = `${message.speaker.toUpperCase()} - ${messageTypeLabel} (${timestamp})`;

                        const content = document.createElement('div');
                        content.style.cssText = `
                            color: #fff;
                            line-height: 1.4;
                        `;
                        content.textContent = message.content;

                        // Add timing info for player attempts
                        if (message.metadata && message.metadata.timing) {
                            const timingInfo = document.createElement('div');
                            timingInfo.style.cssText = `
                                font-size: 11px;
                                color: #999;
                                margin-top: 5px;
                            `;
                            const duration = (message.metadata.timing.attempt_duration / 1000).toFixed(1);
                            timingInfo.textContent = `Duration: ${duration}s`;
                            messageDiv.appendChild(timingInfo);
                        }

                        messageDiv.appendChild(header);
                        messageDiv.appendChild(content);
                        conversationLog.appendChild(messageDiv);
                    });

                    conversationSection.appendChild(conversationLog);
                } else {
                    console.warn('Local conversation history is empty or undefined');
                    const noLocalMsg = document.createElement('div');
                    noLocalMsg.style.cssText = 'color: #ffa726; text-align: center; padding: 20px;';
                    noLocalMsg.textContent = `Local conversation history is empty (${conversationHistory ? conversationHistory.length : 'undefined'} messages)`;
                    conversationSection.appendChild(noLocalMsg);
                }
                
                return; // Skip the server API call
            }
            
            try {
                const response = await fetch(`http://localhost:3000/api/session-history?session_id=${currentSessionId}`);
                console.log('Conversation history API response status:', response.status);
                
                if (response.ok) {
                    const data = await response.json();
                    console.log('Conversation history data:', data);
                    const messages = data.data.conversation_history;
                    console.log('Found', messages.length, 'conversation messages');

                    const conversationLog = document.createElement('div');
                    conversationLog.className = 'conversation-log';
                    conversationLog.style.cssText = `
                        display: flex;
                        flex-direction: column;
                        gap: 10px;
                    `;

                    messages.forEach(message => {
                        const messageDiv = document.createElement('div');
                        messageDiv.className = `message ${message.speaker}`;
                        messageDiv.style.cssText = `
                            padding: 10px;
                            border-radius: 8px;
                            margin-bottom: 8px;
                            ${message.speaker === 'bot' ? 
                                'background: #2d5a87; margin-right: 20px;' : 
                                'background: #4a4a4a; margin-left: 20px;'
                            }
                        `;

                        const header = document.createElement('div');
                        header.style.cssText = `
                            font-size: 12px;
                            color: #ccc;
                            margin-bottom: 5px;
                        `;
                        
                        const timestamp = new Date(message.timestamp).toLocaleTimeString();
                        const messageTypeLabel = message.message_type.replace('_', ' ').toUpperCase();
                        header.textContent = `${message.speaker.toUpperCase()} - ${messageTypeLabel} (${timestamp})`;

                        const content = document.createElement('div');
                        content.style.cssText = `
                            color: #fff;
                            line-height: 1.4;
                        `;
                        content.textContent = message.content;

                        // Add timing info for player attempts
                        if (message.metadata && message.metadata.timing) {
                            const timingInfo = document.createElement('div');
                            timingInfo.style.cssText = `
                                font-size: 11px;
                                color: #999;
                                margin-top: 5px;
                            `;
                            const duration = (message.metadata.timing.attempt_duration / 1000).toFixed(1);
                            timingInfo.textContent = `Duration: ${duration}s`;
                            messageDiv.appendChild(timingInfo);
                        }

                        messageDiv.appendChild(header);
                        messageDiv.appendChild(content);
                        conversationLog.appendChild(messageDiv);
                    });

                    conversationSection.appendChild(conversationLog);
                } else {
                    const errorData = await response.json();
                    console.error('Failed to fetch conversation history:', response.status, errorData);
                    
                    // Show error message in conversation section
                    const errorMsg = document.createElement('div');
                    errorMsg.style.cssText = 'color: #ff6b6b; text-align: center; padding: 20px;';
                    errorMsg.textContent = `Failed to load conversation history (Status: ${response.status})`;
                    conversationSection.appendChild(errorMsg);
                }
            } catch (error) {
                console.error('Error fetching conversation history:', error);
                
                // Show error message in conversation section
                const errorMsg = document.createElement('div');
                errorMsg.style.cssText = 'color: #ff6b6b; text-align: center; padding: 20px;';
                errorMsg.textContent = `Error loading conversation history: ${error.message}`;
                conversationSection.appendChild(errorMsg);
            }
        } else {
            console.warn('No session ID available for fetching conversation history');
            
            // Show no session message
            const noSessionMsg = document.createElement('div');
            noSessionMsg.style.cssText = 'color: #ffa726; text-align: center; padding: 20px;';
            noSessionMsg.textContent = 'No session data available for conversation history';
            conversationSection.appendChild(noSessionMsg);
        }

        // Add both sections to layout
        galleryLayout.appendChild(photoSection);
        galleryLayout.appendChild(conversationSection);
        container.appendChild(galleryLayout);

        console.log('Setting gallery display to flex...');
        gallery.style.display = 'flex';
        console.log('Gallery display set. Current style:', gallery.style.display);
        console.log('Gallery should now be visible!');
    }

    /**
     * Captures the bounding box from the first detection,
     * draws it to an offscreen canvas, returns dataURL of the face.
     * Uses ImageCapture for a full-resolution photo if available,
     * otherwise falls back to capturing from the video element.
     */
    async function takePhoto() {
        if (!currentResizedDetections || currentResizedDetections.length === 0) {
            return null;
        }

        const faceboxResized = currentResizedDetections[0].detection.box;

        // Use ImageCapture for a high-resolution photo if available
        if (imageCapture) {
            try {
                console.log('Taking high-resolution photo with ImageCapture...');
                const imageBitmap = await imageCapture.takePhoto();
                console.log(`Photo captured with resolution: ${imageBitmap.width}x${imageBitmap.height}`);

                // The facebox coordinates are relative to the resized overlay canvas.
                // We need to scale these coordinates to the full photo resolution.
                const scaleX = imageBitmap.width / overlay.width;
                const scaleY = imageBitmap.height / overlay.height;

                const sx = faceboxResized.x * scaleX;
                const sy = faceboxResized.y * scaleY;
                const sWidth = faceboxResized.width * scaleX;
                const sHeight = faceboxResized.height * scaleY;

                // create a canvas sized to the face bounding box
                const canvas = document.createElement('canvas');
                canvas.width = sWidth;
                canvas.height = sHeight;
                const ctx = canvas.getContext('2d');

                // Draw the cropped face from the ImageBitmap onto the new canvas
                ctx.drawImage(
                    imageBitmap,
                    sx, sy, sWidth, sHeight, // Source rectangle from the bitmap
                    0, 0, sWidth, sHeight    // Destination rectangle on the canvas
                );

                // Convert to data URL
                return canvas.toDataURL('image/jpeg');

            } catch (error) {
                console.error('Error using ImageCapture, falling back to video frame:', error);
                // Fall through to the video-based capture if ImageCapture fails
            }
        }

        // Fallback: capture from the visible video element
        console.log('Taking photo from video stream (fallback)...');
        const scaleX = video.videoWidth / overlay.width;
        const scaleY = video.videoHeight / overlay.height;

        const sx = faceboxResized.x * scaleX;
        const sy = faceboxResized.y * scaleY;
        const sWidth = faceboxResized.width * scaleX;
        const sHeight = faceboxResized.height * scaleY;

        // create a canvas sized to the face bounding box
        const canvas = document.createElement('canvas');
        canvas.width = sWidth;
        canvas.height = sHeight;
        const ctx = canvas.getContext('2d');

        // Draw the cropped face from the video onto the new canvas
        ctx.drawImage(
            video,
            sx, sy, sWidth, sHeight, // Source rectangle from the video
            0, 0, sWidth, sHeight    // Destination rectangle on the canvas
        );

        // Convert to data URL
        const dataURL = canvas.toDataURL('image/jpeg');
        return dataURL;
    }

    /**
     * Download the photo locally (like your original snippet).
     */
    function downloadPhoto(dataURL, fileName) {
        const a = document.createElement('a');
        a.href = dataURL;
        a.download = fileName;
        a.click();
    }

    /**
     * Upload the dataURL to Dropbox using fetch
     * - dataURL: base64-encoded 'image/jpeg'
     * - fileName: e.g. 'selfie.jpg'
     */
    async function uploadToDropbox(dataURL, fileName) {
        // 1) Convert dataURL (base64) to raw binary
        const base64Data = dataURL.split(',')[1]; // remove the "data:image/jpeg;base64," prefix
        const blob = base64ToBlob(base64Data);

        // 2) Construct Dropbox API headers & body
        // We'll POST to 'https://content.dropboxapi.com/2/files/upload'
        // For short-lived tokens, see your Dropbox app config
        const dropboxArg = {
            path: `${DROPBOX_UPLOAD_PATH}/${fileName}`,
            mode: 'add',
            autorename: true,
            mute: false
        };

        const response = await fetch('https://content.dropboxapi.com/2/files/upload', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${DROPBOX_ACCESS_TOKEN}`,
                'Dropbox-API-Arg': JSON.stringify(dropboxArg),
                'Content-Type': 'application/octet-stream'
            },
            body: blob
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Dropbox upload failed: ${response.status} ${text}`);
        }
        return await response.json(); // The API returns JSON with file metadata
    }

    /**
     * base64ToBlob helper: convert raw base64 string => Blob
     */
    function base64ToBlob(base64Data) {
        // decode base64
        const byteString = atob(base64Data);
        const arrayBuffer = new ArrayBuffer(byteString.length);
        const intArray = new Uint8Array(arrayBuffer);

        for (let i = 0; i < byteString.length; i++) {
            intArray[i] = byteString.charCodeAt(i);
        }
        // "image/jpeg" as mime type
        return new Blob([arrayBuffer], { type: 'image/jpeg' });
    }

    async function captureAndStorePhoto() {
        if (!currentResizedDetections || currentResizedDetections.length === 0) {
            console.log('No face detected, cannot take photo');
            return;
        }

        // 1) Capture the photo data URL
        const dataURL = await takePhoto();
        if (!dataURL) return;

        // 2) Store the photo data URL with its emotion
        capturedPhotos.push({ emotion: targetEmotion, dataURL: dataURL });
        console.log(`Stored photo for ${targetEmotion}`);
    }

    // Event listener for skipping tutorial lines and debugging
    document.addEventListener('keydown', (event) => {
        if (event.key === 's' || event.key === 'S') {
            if (GAME_MODE === "tutorial") {
                console.log('Tutorial skip requested with S key');
                
                // Stop any scheduled next message first.
                if (tutorialTimeoutId) {
                    console.log('Clearing tutorial timeout:', tutorialTimeoutId);
                    clearTimeout(tutorialTimeoutId);
                    tutorialTimeoutId = null;
                }

                // Stop any TTS that is currently playing.
                console.log('Stopping current TTS playback');
                messagingSystem.stop();

                // Immediately mark the tutorial as "finished" and start the game.
                console.log('Marking tutorial as complete and starting game');
                GAME_MODE = "game"; // Set mode to game immediately to prevent further tutorial messages
                currentTutorialIndex = tutorialMessages.length;
                
                // Invalidate current message sequence to prevent stale messages
                invalidateCurrentSequence();
                
                // Add a small delay to ensure TTS is fully stopped before starting game
                setTimeout(() => {
                    console.log('Starting game after tutorial skip');
                    runGame();
                }, 100);
            }
        }
        
        // Debug key for stuck emotions - press 'R' to reset current emotion state
        if (event.key === 'r' || event.key === 'R') {
            if (GAME_MODE === "game") {
                console.log('MANUAL EMOTION RESET requested with R key');
                console.log('Before reset:', {
                    targetEmotion,
                    targetEmotionSelected,
                    emotionHoldStartTime,
                    gameMode: GAME_MODE
                });
                
                // Reset emotion detection state
                targetEmotionSelected = false;
                emotionHoldStartTime = null;
                emotionAttemptStartTime = performance.now();
                lastCoachingTime = performance.now();
                
                // Stop any current TTS
                messagingSystem.stop();
                
                console.log('After reset:', {
                    targetEmotion,
                    targetEmotionSelected,
                    emotionHoldStartTime,
                    gameMode: GAME_MODE
                });
                
                console.log('Manual reset complete - try expressing the emotion again');
            }
        }
        
        // Debug mode toggle - press 'D' to enable/disable verbose debugging
        if (event.key === 'd' || event.key === 'D') {
            DEBUG_MODE = !DEBUG_MODE;
            console.log(`DEBUG MODE ${DEBUG_MODE ? 'ENABLED' : 'DISABLED'}`);
            if (DEBUG_MODE) {
                console.log('Verbose debugging is now active (emotion detection, face detection health)');
            } else {
                console.log('Verbose debugging disabled for better performance');
            }
        }
    });

    if (bypassIntro) {
        introOverlay.style.display = 'none';
        if (GAME_MODE === "tutorial") {
            // document.getElementById('tutorialOverlay').style.display = 'block';
            startVideo();
            runTutorial();
        } else if (GAME_MODE === "game") {
            startVideo();
        }
    }

});
