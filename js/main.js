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
    
    const introHeader = document.querySelector('#introOverlay h1');

    async function getOpenAIResponse(prompt, maxTokens) {
        try {
            const body = { prompt };
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
    let previousResizedDetections = [];
    let prevRect;
    let currentResizedDetections = [];
    let targetEmotionSelected = false;

    let overlayOffsetX = 0;
    let overlayOffsetY = 0;

    let emotionHoldStartTime = null         // when the user first exceeds threshold
    const REQUIRED_HOLD_TIME = 800          // time they must hold emotion (ms)
    const EMOTION_THRESHOLD = 70            // 80% match required

    const detectionInterval = 200; // ms

    const EMOTIONS = ['happy', 'sad', 'angry', 'neutral', 'surprised', 'disgusted', 'fearful'];

    let tutorialMessages = [
        'Hello X', // Will be replaced by "Hello, [userName]"
        'Welcome to the Emotion Game!',
        'This game will test your ability to express emotions with your face.',
        'Ensure your face is clearly visible in the camera view.',
        'Try to match the target emotion shown on screen.',
        'Hold the expression for a moment to register.',
        'Good luck and have fun!',
        'Get ready...'
    ];

    let endMessages = [
        'Thank you for playing!',
        'You have completed the Emotion Game!'
    ];

    let currentTutorialIndex = 0;

    let userName = '';

    let bypassIntro = false;
    let GAME_MODE = "tutorial";

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

            // Wait for the video metadata to be loaded
            video.onloadedmetadata = () => {
                console.log(`Video metadata loaded. Camera resolution: ${video.videoWidth}x${video.videoHeight}`);
            };
            // Add an error handler for the video element itself
            video.onerror = (e) => {
                console.error("Video element error:", e);
                alert("Error playing video stream. Please check camera permissions and hardware.");
            };

        } catch (err) {
            console.error('Error in startVideo:', err);
            // alert('Could not access webcam. Please allow webcam access and refresh the page. Details in console.');
            // Re-throw the error if we want the nameSubmit catch block to also handle it
            throw err;
        }
        console.log("Exiting startVideo function");
    }

    // event listener for resizing window
    window.addEventListener('resize', () => {
        // get the overlay's offset
        const overlayRect = overlay.getBoundingClientRect();
        overlayOffsetX = overlayRect.left;
        overlayOffsetY = overlayRect.top;
    });

    video.addEventListener('loadedmetadata', () => {

        // set videoContainer size to video size
        videoContainer.style.width = `${video.videoWidth}px`;
        videoContainer.style.height = `${video.videoHeight}px`;

        const rect = video.getBoundingClientRect();
        const displaySize = { width: rect.width, height: rect.height };

        // get the overlay's offset
        const overlayRect = overlay.getBoundingClientRect();
        overlayOffsetX = overlayRect.left;
        overlayOffsetY = overlayRect.top;

        faceapi.matchDimensions(overlay, displaySize);

        // start detection loop separately
        startDetectionLoop(displaySize);

        // start animation loop
        requestAnimationFrame(animate);
    });

    function startDetectionLoop(displaySize) {
        const detectionOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });

        setInterval(async () => {
            const detections = await faceapi.detectAllFaces(video, detectionOptions)
                .withFaceLandmarks()
                .withFaceExpressions();

            if (detections.length > 0) {
                lastDetections = detections;
            }

            // store resized detections to be used by the animation loop
            currentResizedDetections = faceapi.resizeResults(lastDetections, displaySize);

            // requestAnimationFrame(animate);
        }, detectionInterval);
    }

    function drawDetections(context, detections) {
        context.strokeStyle = 'yellow';
        context.lineWidth = 2;
        detections.forEach(detection => {
            const box = detection.detection.box;
            context.strokeRect(box.x, box.y, box.width, box.height);
        });
    }

    function animate() {
        // clear the canvas
        canvasContext.clearRect(0, 0, overlay.width, overlay.height);

        if (currentResizedDetections && currentResizedDetections.length > 0) {
            // The resized detections are already in the overlay's coordinate system.
            // No translation is needed for drawing on the canvas.
            drawDetections(canvasContext, currentResizedDetections);
            faceapi.draw.drawFaceLandmarks(overlay, currentResizedDetections);
            
            // position the readout div on top of face, centered
            const facebox = currentResizedDetections[0].detection.box;

            // for mirrored video
            readout.style.left = `${overlay.offsetWidth - (facebox.x + facebox.width / 2 + readout.offsetWidth / 2) + overlayOffsetX}px`;
            readout.style.top = `${facebox.y + facebox.height + overlayOffsetY}px`;
        }

        // Update emotions based on latest detections
        updateEmotions(currentResizedDetections);

        // Request the next frame
        requestAnimationFrame(animate);
    }

    function lerp(start, end, amt) {
        return start + (end - start) * amt;
    }



    let emotionsCompleted = 0;
    let usedEmotions = [];

    function updateEmotions(detections) {
        if (detections.length > 0) {
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
                            // The user has maintained the required emotion for the required time
                            const audio = new Audio('/sounds/ding.wav');
                            audio.play();

                            messages.textContent = 'Good job! Moving to the next emotion!';
                            targetEmotionSelected = true;

                            // Increment the emotions completed counter
                            emotionsCompleted++;
                            usedEmotions.push(targetEmotion);

                            // Check if the player has completed three emotions
                            if (emotionsCompleted >= 3) {
                                runEnd();
                            } else {
                                // Reset or move on to the next emotion
                                setTimeout(() => {
                                    targetEmotionSelected = false;
                                    selectNewTargetEmotion();
                                }, 2000);
                            }
                        }
                    }
                } else {
                    // If we dropped below threshold, reset the hold timer
                    emotionHoldStartTime = null;
                }
            }
        } else if (lastDetections.length > 0) {
            // Optionally handle "no face detected" logic here
        }
    }

    function selectNewTargetEmotion() {
        const availableEmotions = EMOTIONS.filter(emotion => emotion !== 'neutral' && !usedEmotions.includes(emotion));
        if (availableEmotions.length === 0) {
            console.error('No more available emotions to select.');
            return;
        }
        targetEmotion = availableEmotions[Math.floor(Math.random() * availableEmotions.length)];
        targetEmotionSpan.textContent = targetEmotion;
        matchPercentageSpan.textContent = '0%';
        feedbackMessage.textContent = '';
        targetEmotionSelected = false;
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

        console.log("nameSubmit clicked"); // Step 1
        const nameInput = document.getElementById('nameField');
        userName = nameInput.value.trim() || 'Guest';
        messagingSystem.setLoadingMessage('Loading...');
        introOverlay.style.display = 'none';
        console.log("Hiding introOverlay:", introOverlay); // Step 2

        const greeting = await getOpenAIGreeting(userName);

        await messagingSystem.playMessage(greeting, async () => {
            try { // Step 6
                messagingSystem.clearMessage();
                console.log("Greeting finished: Attempting to start video..."); // Step 4
                await startVideo();
                console.log("Greeting finished: Video started (or attempted)"); // Step 4
                console.log("Greeting finished: Attempting to run tutorial..."); // Step 5
                runTutorial();
                console.log("Greeting finished: Tutorial run (or attempted)"); // Step 5
            } catch (error) {
                console.error("Error in nameSubmit setTimeout:", error); // Step 6
                messagingSystem.setLoadingMessage('Error during startup. Please check console.'); // Step 6
            }
        });

        // replace the first tutorialMessage with Welcome, User
        tutorialMessages[0] = `Hello, ${userName}`;
    });

    // Show tutorial messages one by one using the unified messaging system
    async function showNextMessage() {
        if (currentTutorialIndex >= tutorialMessages.length) {
            // All messages shown - show tutorial overlay
            const tutorialOverlay = document.getElementById('tutorialOverlay');
            messages.appendChild(tutorialOverlay);
            tutorialOverlay.style.display = 'block';
            tutorialOverlay.style.pointerEvents = 'auto';
            return;
        }

        const currentMessage = tutorialMessages[currentTutorialIndex];
        currentTutorialIndex++;

        await messagingSystem.playMessage(currentMessage);

        // Brief pause before next message
        if (currentTutorialIndex < tutorialMessages.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            showNextMessage(); // Continue with next message
        } else {
            // All messages shown - show tutorial overlay
            const tutorialOverlay = document.getElementById('tutorialOverlay');
            messages.appendChild(tutorialOverlay);
            tutorialOverlay.style.display = 'block';
            tutorialOverlay.style.pointerEvents = 'auto';
        }
    }

    async function runEnd() {
        // hide #readout
        readout.style.display = 'none';

        GAME_MODE = "end";

        // Play all end messages sequentially
        for (let i = 0; i < endMessages.length; i++) {
            await messagingSystem.playMessage(endMessages[i]);
            
            // Brief pause between messages (except for the last one)
            if (i < endMessages.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // Fade the screen to black after the last message
        setTimeout(() => {
            const fadeOverlay = document.getElementById('fadeOverlay');
            fadeOverlay.style.opacity = '1';
        }, 2000);
    }


    function runTutorial() {
        GAME_MODE = "tutorial";
        currentTutorialIndex = 0; // Reset index for skippable tutorial
        showNextMessage(); // Now calls the globally (within DOMContentLoaded) defined showNextMessage
    }

    function runGame() {
        GAME_MODE = "game";
        selectNewTargetEmotion();

        // show #readout
        readout.style.display = 'block';

        // after 3 seconds, call takePhoto
        setTimeout(async () => {
            // guard if we have no face
            if (!currentResizedDetections || currentResizedDetections.length === 0) {
                console.log('No face detected, cannot take photo');
                return;
            }

            // 1) Capture the photo data URL
            const dataURL = takePhoto();
            if (!dataURL) return;

            // 2) Download locally (like original snippet)
            downloadPhoto(dataURL, 'selfie.jpg');

            // 3) Upload to Dropbox (do this later)
            // try {
            //     await uploadToDropbox(dataURL, 'selfie.jpg');
            //     console.log('✅ Photo uploaded to Dropbox!');
            // } catch (err) {
            //     console.error('❌ Dropbox upload error:', err);
            // }
        }, 5000);
    }

    /**
 * Captures the bounding box from the first detection,
 * draws it to an offscreen canvas, returns dataURL of the face
 */
    function takePhoto() {
        if (!currentResizedDetections || currentResizedDetections.length === 0) {
            return null;
        }

        const facebox = currentResizedDetections[0].detection.box;

        // create a canvas sized to the face bounding box
        const canvas = document.createElement('canvas');
        canvas.width = facebox.width;
        canvas.height = facebox.height;
        const ctx = canvas.getContext('2d');

        // Mirror considerations? If you have mirrored video, coordinates may differ.
        // For a normal (non-mirrored) feed:
        ctx.drawImage(
            video,
            facebox.x, facebox.y, facebox.width, facebox.height, // from the video
            0, 0, facebox.width, facebox.height                  // onto the canvas
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

    document.getElementById('tutorialReadyBtn').addEventListener('click', () => {
        document.getElementById('tutorialOverlay').style.display = 'none';
        // clear any messages
        messagingSystem.clearMessage();
        // make overFace get no pointer events
        document.getElementById('overFace').style.pointerEvents = 'none';

        runGame();
    });

    // Event listener for skipping tutorial lines
    document.addEventListener('keydown', (event) => {
        if (event.key === 's' || event.key === 'S') {
            if (GAME_MODE === "tutorial" && currentTutorialIndex < tutorialMessages.length) {
                // Advance to the next message immediately
                showNextMessage();
            } else if (GAME_MODE === "tutorial" && currentTutorialIndex >= tutorialMessages.length) {
                // If at the last message, simulate "READY" button click
                document.getElementById('tutorialReadyBtn').click();
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
