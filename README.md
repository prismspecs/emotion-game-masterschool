# Project Title
**Emotion Challenge Game**

## Description
The Emotion Challenge Game is an interactive web application that uses your webcam to detect your facial expressions. The game challenges you to match a series of target emotions. It's a fun way to explore emotion recognition technology and practice your acting skills!

## How to Play
1.  **Allow Webcam Access:** When prompted by your browser, allow access to your webcam.
2.  **Enter Your Name:** You'll see an intro screen. Type your name into the input field and click "Submit" (or press Enter).
3.  **Follow the Tutorial:** A short tutorial will guide you through the basics of the game and how face detection works. Ensure your face is visible within the camera frame. Click "READY" when the tutorial is done.
4.  **Match the Emotions:**
    *   The game will display a "Target Emotion" (e.g., happy, sad, angry).
    *   Try to make that facial expression. You'll see a "Match Percentage" indicating how well the system detects your emotion.
    *   You need to hold the expression above a certain match percentage (70%) for a short duration (0.8 seconds) to succeed.
    *   A sound will indicate a successful match.
5.  **Complete the Challenges:** Successfully match three different emotions to complete the game.
6.  **See Your Results:** An end sequence will play after you complete the challenges.

## Features
*   **Real-time Face Detection:** Detects faces from the webcam feed.
*   **Facial Landmark Detection:** Identifies key facial points.
*   **Emotion Recognition:** Recognizes a range of facial expressions (happy, sad, angry, neutral, surprised, disgusted, fearful).
*   **Interactive Gameplay:** Challenges users to match target emotions.
*   **Tutorial Mode:** Guides new users through the game mechanics.
*   **Match Percentage Feedback:** Provides real-time feedback on emotion matching accuracy.
*   **Progressive Challenges:** Users need to complete a series of emotion matches.
*   **Sound Cues:** Audio feedback for successful actions.

## Technologies Used
*   **HTML5:** For the basic structure of the web page.
*   **CSS3:** For styling the user interface.
*   **JavaScript (ES6+):** For the core game logic, interactivity, and webcam integration.
*   **face-api.js:** A JavaScript API for face detection and face recognition in the browser, built on top of tensorflow.js.
    *   Tiny Face Detector model
    *   Face Landmark 68 Net model
    *   Face Recognition Net model
    *   Face Expression Net model

## Setup and Installation
No complex setup is required to run this game.

1.  **Clone or Download the Repository (Optional):** If you want to host it yourself or explore the code, you can clone this repository or download the files.
    ```bash
    git clone <repository_url> 
    ```
    (Replace `<repository_url>` with the actual URL if you are hosting it on a platform like GitHub.)

2.  **Open `index.html`:** Navigate to the project directory and open the `index.html` file in a modern web browser that supports webcam access (e.g., Chrome, Firefox, Edge).

3.  **Allow Webcam Access:** When prompted by your browser, grant permission for the site to use your webcam.

That's it! The game should load, and you can start playing."

## File Structure
*   `index.html`: The main HTML file that structures the game's interface.
*   `css/`: Directory containing the stylesheet.
    *   `style.css`: Main CSS file for styling the game.
*   `js/`: Directory containing JavaScript files.
    *   `main.js`: Contains the core game logic, webcam integration, and `face-api.js` implementation.
    *   `face-api.js`: The (likely minified) face-api.js library for face and emotion detection.
*   `models/`: Directory containing the pre-trained models required by `face-api.js` for detection and recognition tasks.
*   `sounds/`: Directory for audio files used in the game.
    *   `ding.wav`: Sound effect for successful emotion matching.
*   `data/`: Directory intended for game data.
    *   `lines.json`: (Currently unused in the active game logic) Contains dialogue lines that could be integrated into the game.
*   `README.md`: This file, providing information about the project.

## Potential Future Enhancements
*   **Integrate Dialogue:** Utilize the `data/lines.json` file to have characters deliver lines that the player must then say with the target emotion.
*   **Advanced Scoring:** Implement a more nuanced scoring system, perhaps factoring in the intensity of the emotion or the speed of matching.
*   **Multiple Rounds/Levels:** Introduce different levels with increasing difficulty or varying emotion sets.
*   **Character Selection:** Allow players to choose an avatar or character.
*   **Improved Visual Feedback:** Enhance the visual cues for face detection and emotion matching (e.g., dynamic overlays, progress bars for holding emotion).
*   **Leaderboard:** If hosting online, add a leaderboard to track high scores.
*   **Customizable Emotion Sets:** Allow users to select which emotions they want to practice.
*   **Head Pose Detection:** Incorporate head pose detection as an additional challenge or feedback mechanism.
*   **Accessibility Improvements:** Further enhance accessibility for users with different needs.
