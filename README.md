# Project Title

**Emotion Challenge Game**

## Description

The Emotion Challenge Game is an interactive web application that uses your webcam to detect your facial expressions. The game challenges you to match a series of target emotions. It's a fun way to explore emotion recognition technology and practice your acting skills!

## How to Play

1.  **Allow Webcam Access:** When prompted by your browser, allow access to your webcam.
2.  **Enter Your Name:** You'll see an intro screen. Type your name into the input field and click "Submit" (or press Enter).
3.  **Follow the Tutorial:** A short tutorial will guide you through the basics of the game and how face detection works. Ensure your face is visible within the camera frame. Click "READY" when the tutorial is done.
4.  **Match the Emotions:**
    - The game will display a "Target Emotion" (e.g., happy, sad, angry).
    - Try to make that facial expression. You'll see a "Match Percentage" indicating how well the system detects your emotion.
    - You need to hold the expression above a certain match percentage (70%) for a short duration (0.8 seconds) to succeed.
    - A sound will indicate a successful match.
5.  **Complete the Challenges:** Successfully match three different emotions to complete the game.
6.  **See Your Results:** An end sequence will play after you complete the challenges.

## Features

- **Real-time Face Detection:** Detects faces from the webcam feed.
- **Facial Landmark Detection:** Identifies key facial points.
- **Emotion Recognition:** Recognizes a range of facial expressions (happy, sad, angry, neutral, surprised, disgusted, fearful).
- **Interactive Gameplay:** Challenges users to match target emotions.
- **Tutorial Mode:** Guides new users through the game mechanics.
- **Match Percentage Feedback:** Provides real-time feedback on emotion matching accuracy.
- **Progressive Challenges:** Users need to complete a series of emotion matches.
- **Sound Cues:** Audio feedback for successful actions.

## How to Run

This project requires a backend server to be running to handle API calls securely.

1.  **Clone the Repository:**

    ```bash
    git clone <repository_url>
    cd <repository_directory>
    ```

2.  **Set Up the Backend:**

    - Create a file named `.env` in the root of the project.
    - Add your OpenAI API key to this file: `OPENAI_API_KEY=your_key_here`
    - Open a terminal and run `npm install` to install the necessary dependencies.
    - Run `npm start` to launch the backend server. It will be running on `http://localhost:3000`.

3.  **Launch the Frontend:**
    - In a separate terminal or using a tool like the VS Code Live Server extension, serve the `index.html` file.
    - Open the provided URL (usually `http://127.0.0.1:5500` or similar) in your browser.
    - Allow webcam access when prompted.

## Technologies Used

- **HTML5:** For the basic structure of the web page.
- **CSS3:** For styling the user interface.
- **Frontend JavaScript (ES6+):** For the core game logic and interactivity.
- **Backend: Node.js & Express.js:** A simple server to securely proxy API requests to OpenAI.
- **face-api.js:** A JavaScript API for face detection and recognition in the browser.
- **OpenAI API:** Used to generate dynamic, contextual content.

## File Structure

- `index.html`: The main HTML file for the game's interface.
- `server.js`: The Node.js Express server that proxies API requests.
- `package.json`: Defines the project's Node.js dependencies and scripts.
- `.env`: A file (which should be in `.gitignore`) to store secret API keys.
- `css/`: Directory for stylesheets.
- `js/`: Directory for frontend JavaScript files.
- `models/`: Directory for pre-trained `face-api.js` models.
- `sounds/`: Directory for audio files.
- `README.md`: This file, providing information about the project.

## Potential Future Enhancements

- **Integrate Dialogue:** Utilize the `data/lines.json` file to have characters deliver lines that the player must then say with the target emotion.
- **Advanced Scoring:** Implement a more nuanced scoring system, perhaps factoring in the intensity of the emotion or the speed of matching.
- **Multiple Rounds/Levels:** Introduce different levels with increasing difficulty or varying emotion sets.
- **Character Selection:** Allow players to choose an avatar or character.
- **Improved Visual Feedback:** Enhance the visual cues for face detection and emotion matching (e.g., dynamic overlays, progress bars for holding emotion).
- **Leaderboard:** If hosting online, add a leaderboard to track high scores.
- **Customizable Emotion Sets:** Allow users to select which emotions they want to practice.
- **Head Pose Detection:** Incorporate head pose detection as an additional challenge or feedback mechanism.
- **Accessibility Improvements:** Further enhance accessibility for users with different needs.
