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
                throw new Error(`API request failed with status ${response.status}`);
            }

            const data = await response.json();
            return data.choices[0].message.content.trim();
        } catch (error) {
            console.error('Failed to fetch OpenAI response:', error);
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

            if (GAME_MODE == "game" && targetEmotion && !targetEmotionSelected) {
                const matchPercentage = (emotions[targetEmotion] || 0) * 100;
                matchPercentageSpan.textContent = `${matchPercentage.toFixed(2)}%`;

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

                            const prompt = `The player just succeeded at expressing "${targetEmotion}". Give a short, excited, congratulatory message for mastering it in ${timeToAchieve.toFixed(1)} seconds. Do NOT mention what is next. Keep it under 20 words.`;
                            const congratsMessage = await getOpenAIResponse(prompt, 40);

                            await messagingSystem.playMessage(congratsMessage || `Well done!`);

                            emotionsCompleted++;
                            usedEmotions.push(targetEmotion);

                            if (emotionsCompleted >= EMOTIONS_PER_GAME) {
                                runEnd();
                            } else {
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
                        if (dominantEmotion !== targetEmotion) {
                            prompt = `The player is trying to show "${targetEmotion}", but their expression is reading as "${dominantEmotion}". Give them a short, cryptic, and darkly humorous tip (under 25 words) to help them adjust their face.`;
                        } else {
                            prompt = `The player is on the right track showing "${targetEmotion}", but they need to make the expression stronger. Give them a very short, menacing, and cryptic tip (under 15 words) to intensify it.`;
                        }

                        const coachingMessage = await getOpenAIResponse(prompt, 50);

                        if (coachingMessage) {
                            await messagingSystem.playMessage(coachingMessage);
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
        const availableEmotions = PLAYABLE_EMOTIONS.filter(emotion => !usedEmotions.includes(emotion));
        targetEmotion = availableEmotions[Math.floor(Math.random() * availableEmotions.length)];

        // Update UI and state *immediately* so the game can proceed
        // even if the announcement has issues.
        targetEmotionSpan.textContent = targetEmotion;
        matchPercentageSpan.textContent = '0%';
        feedbackMessage.textContent = '';
        targetEmotionSelected = false;
        emotionAttemptStartTime = performance.now();
        lastCoachingTime = performance.now(); // Reset coaching timer for a grace period
        readout.style.display = 'block';

        // Announce the new emotion
        let announcementPrompt;
        if (usedEmotions.length === 0) {
            announcementPrompt = `This is the first challenge. Announce the emotion "${targetEmotion}" as the starting test. Do not welcome the player to the game, since that has already happened. Keep it short, under 15 words. For example: "Let's begin. Your first challenge: ${targetEmotion}!"`;
        } else {
            announcementPrompt = `Now, challenge the player to express the emotion: "${targetEmotion}". Keep the message short, engaging, and under 15 words. For example: "Your next challenge: ${targetEmotion}!"`;
        }
        const announcementMessage = await getOpenAIResponse(announcementPrompt, 30);
        await messagingSystem.playMessage(announcementMessage || `Now try: ${targetEmotion}`);

        emotionsCompleted++;
        usedEmotions.push(targetEmotion);

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
        const greeting = await getOpenAIGreeting(userName);

        if (greeting) {
            // Play greeting message and wait for it to complete
            await messagingSystem.playMessage(greeting);
        } else {
            // Fallback if greeting fails
            await messagingSystem.playMessage(`Welcome to the Emotion Game, ${userName}!`);
        }

        // Clear message and start tutorial after greeting is done
        messagingSystem.clearMessage();
        console.log("Greeting finished: Starting tutorial...");
        runTutorial();
    });

    // Show tutorial messages one by one using the unified messaging system
    async function showNextMessage() {
        if (currentTutorialIndex >= tutorialMessages.length) {
            // All messages are done, or the tutorial was skipped. Start the game.
            runGame();
            return;
        }

        const currentMessage = tutorialMessages[currentTutorialIndex];
        currentTutorialIndex++;

        await messagingSystem.playMessage(currentMessage);

        // After the message has played, check if we should continue or start the game.
        if (currentTutorialIndex < tutorialMessages.length) {
            tutorialTimeoutId = setTimeout(showNextMessage, 1000);
        } else {
            // We've finished the last message.
            runGame();
        }
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
        readout.style.display = 'none';
        GAME_MODE = "end";

        const endPrompt = `The player has successfully completed all emotion challenges. Deliver a final, conclusive, and slightly menacing message to them, remarking on their success and the completion of the game. Address them by their name, ${userName}. Keep it under 30 words.`;
        const endMessage = await getOpenAIResponse(endPrompt, 60);

        await messagingSystem.playMessage(endMessage || 'The game is over. You have survived.');

        // Fade the screen to black after the final message
        setTimeout(() => {
            const fadeOverlay = document.getElementById('fadeOverlay');
            if (fadeOverlay) {
                fadeOverlay.style.transition = 'opacity 2s ease-in-out';
                fadeOverlay.style.opacity = '1';
                // After fade is complete, show the gallery
                setTimeout(showPhotoGallery, 2000);
            }
        }, 2000);
    }

    function showPhotoGallery() {
        const gallery = document.getElementById('photoGallery');
        const container = document.getElementById('galleryContainer');
        container.innerHTML = ''; // Clear previous items

        capturedPhotos.forEach(photo => {
            const item = document.createElement('div');
            item.className = 'gallery-item';

            const img = document.createElement('img');
            img.src = photo.dataURL;

            const label = document.createElement('span');
            label.className = 'label';
            label.textContent = photo.emotion;

            const saveBtn = document.createElement('button');
            saveBtn.className = 'save-btn';
            saveBtn.textContent = 'Save';
            saveBtn.onclick = () => {
                downloadPhoto(photo.dataURL, `${photo.emotion}.jpg`);
            };

            item.appendChild(img);
            item.appendChild(label);
            item.appendChild(saveBtn);
            container.appendChild(item);
        });

        gallery.style.display = 'flex';
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

    // Event listener for skipping tutorial lines
    document.addEventListener('keydown', (event) => {
        if (event.key === 's' || event.key === 'S') {
            if (GAME_MODE === "tutorial") {
                // Stop any scheduled next message first.
                if (tutorialTimeoutId) {
                    clearTimeout(tutorialTimeoutId);
                    tutorialTimeoutId = null;
                }

                // Stop any TTS that is currently playing.
                messagingSystem.clearMessage();

                // Immediately mark the tutorial as "finished" and start the game.
                currentTutorialIndex = tutorialMessages.length;
                runGame();
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
