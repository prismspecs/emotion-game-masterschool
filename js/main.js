document.addEventListener('DOMContentLoaded', async () => {
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
        'Hello X',
        '<span class="jurassic">Welcome to<br>Jur Ass Itch Park</span>',
        'This will briefly explain how the game works before you play it',
        'Move your phone so that your face is within the camera',
        'Try to keep still for better detection',
        'You will be given a line of dialogue and an emotional cue',
        'Deliver the line while portraying that emotion with your face',
        'The system will give you a grade at the end',
        '        ',
        'Okay, get ready...'
    ];
    // tutorialMessages = [
    //     "test"
    // ];

    let endMessages = [
        'Thank you for playing!',
        'You are now ready for your role in...',
        '<span class="jurassic">Jur Ass Itch Park</span>'
    ];

    const durationPerCharacter = 150;

    let userName = '';

    let bypassIntro = false;
    let GAME_MODE = "tutorial";

    // load lines from lines.json
    // const response = await fetch('/lines.json');
    // const lines = await response.json();
    const lines = [
        {
            "character": "Willy",
            "line": "It's all right. I came back."
        },
        {
            "character": "Linda",
            "line": "Why? What happened? Did something happen, Willy?"
        },
        {
            "character": "Willy",
            "line": "No, nothing happened."
        },
        {
            "character": "Linda",
            "line": "You didn’t smash the car, did you?"
        },
        {
            "character": "Willy",
            "line": "I said nothing happened. Didn’t you hear me?"
        }
    ];

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
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');

            if (videoDevices.length === 0) {
                throw new Error('No video input devices found');
            }

            // flip overlay and videoElement horizontally
            video.style.transform = 'scaleX(-1)';
            overlay.style.transform = 'scaleX(-1)';

            const constraints = {
                video: {
                    facingMode: 'user',
                    aspectRatio: { ideal: 16 / 9 }
                }
            };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = stream;

            // Wait for the video metadata to be loaded
            video.onloadedmetadata = () => {
                console.log(`Camera resolution: ${video.videoWidth}x${video.videoHeight}`);
            };
        } catch (err) {
            console.error('Error accessing webcam:', err);
            alert('Could not access webcam. Please allow webcam access and refresh the page.');
        }
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

    function drawDetectionsWithoutScore(canvas, detections) {
        const ctx = canvas.getContext('2d');
        ctx.strokeStyle = 'yellow';
        ctx.lineWidth = 2;

        detections.forEach(detection => {
            const box = detection.detection.box;
            ctx.strokeRect(box.x, box.y, box.width, box.height);
        });
    }

    function animate() {
        // clear the canvas
        canvasContext.clearRect(0, 0, overlay.width, overlay.height);

        if (currentResizedDetections && currentResizedDetections.length > 0) {
            // adjust the drawing coordinates based on the overlay's offset
            currentResizedDetections.forEach(detection => {
                detection.detection.box.x += overlayOffsetX;
                detection.detection.box.y += overlayOffsetY;
                detection.landmarks.positions.forEach(position => {
                    position.x += overlayOffsetX;
                    position.y += overlayOffsetY;
                });
            });

            // Draw the detection box without the score
            drawDetectionsWithoutScore(overlay, currentResizedDetections);
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
    document.getElementById('nameSubmit').addEventListener('click', () => {
        const nameInput = document.getElementById('nameField');
        userName = nameInput.value.trim() || 'Guest';
        messages.textContent = 'Loading...'
        introOverlay.style.display = 'none';;
        setTimeout(() => {
            messages.textContent = '';

            startVideo();
            runTutorial();
        }, 2000);
        // document.getElementById('lines').textContent = `Welcome ${userName}`;
        // replace the first tutorialMessage with Welcome, User
        tutorialMessages[0] = `Hello, ${userName}`;
    });

    function runEnd() {
        // hide #readout
        readout.style.display = 'none';

        GAME_MODE = "end";

        let index = 0;

        function showNextEndMessage() {
            messages.style.opacity = '0';
            setTimeout(() => {
                messages.innerHTML = endMessages[index];
                messages.style.opacity = '1';
                index++;
                if (index < endMessages.length) {
                    setTimeout(showNextEndMessage, endMessages[index].length * durationPerCharacter);
                } else {
                    // Fade the screen to black after the last message
                    setTimeout(() => {
                        const fadeOverlay = document.getElementById('fadeOverlay');
                        fadeOverlay.style.opacity = '1';
                    }, 2000); // Adjust the delay as needed
                }
            }, 1000);
        }

        showNextEndMessage();
    }


    function runTutorial() {
        GAME_MODE = "tutorial";

        let index = 0;

        function showNextMessage() {
            messages.style.opacity = '0';
            setTimeout(() => {
                messages.innerHTML = tutorialMessages[index];
                messages.style.opacity = '1';
                index++;
                if (index < tutorialMessages.length) {
                    setTimeout(showNextMessage, tutorialMessages[index].length * durationPerCharacter);
                } else {
                    // Make tutorialOverlay a child of messages
                    const tutorialOverlay = document.getElementById('tutorialOverlay');
                    messages.appendChild(tutorialOverlay);
                    tutorialOverlay.style.display = 'block';
                    // allow pointer events on overFace
                    tutorialOverlay.style.pointerEvents = 'auto';



                    // Switch to game mode and select a new target emotion
                    // GAME_MODE = "game";
                    // selectNewTargetEmotion();
                }
            }, 1000);
        }
        showNextMessage();
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
        // erase text from #messages
        document.getElementById('messages').textContent = '';
        // make overFace get no pointer events
        document.getElementById('overFace').style.pointerEvents = 'none';

        runGame();
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
