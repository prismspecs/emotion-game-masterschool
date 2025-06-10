/**
 * Unified Messaging System
 * Combines TTS speech with synchronized text display
 * Shows text one sentence at a time, timed to speech duration
 */

class UnifiedMessagingSystem {
    constructor() {
        this.voices = [];
        this.currentUtterance = null;
        this.messagesElement = null;
        this.isPlaying = false;
        this.currentQueue = [];
        this.currentSentenceIndex = 0;
        this.initializeVoices();
        this.initializeMessageElement();
    }

    initializeVoices() {
        if (typeof speechSynthesis === 'undefined') {
            console.warn('Speech synthesis not supported');
            return;
        }

        const populateVoices = () => {
            this.voices = speechSynthesis.getVoices();
        };

        populateVoices();
        if (speechSynthesis.onvoiceschanged !== undefined) {
            speechSynthesis.onvoiceschanged = populateVoices;
        }
    }

    initializeMessageElement() {
        this.messagesElement = document.getElementById('messages');
        if (!this.messagesElement) {
            console.error('Messages element not found');
        }
    }

    /**
     * Get the best available voice for speech synthesis
     */
    getSelectedVoice() {
        if (this.voices.length === 0) return null;
        
        return this.voices.find(voice => voice.name === 'Google US English') ||
               this.voices.find(voice => voice.name === 'Microsoft David Desktop - English (United States)') ||
               this.voices.find(voice => voice.name === 'Alex') ||
               this.voices.find(voice => voice.lang === 'en-US') ||
               this.voices[0]; // Fallback to first available voice
    }

    /**
     * Split text into sentences, handling various punctuation
     */
    splitIntoSentences(text) {
        // Split on sentence-ending punctuation followed by whitespace or end of string
        const sentences = text.split(/(?<=[.!?])\s+/)
            .map(s => s.trim())
            .filter(s => s.length > 0);
        
        return sentences;
    }

    /**
     * Estimate speech duration based on text length and speech rate
     * This is an approximation - actual duration may vary
     */
    estimateSpeechDuration(text, rate = 0.9) {
        // Average words per minute for speech synthesis (adjusted for rate)
        const baseWPM = 150;
        const adjustedWPM = baseWPM * rate;
        const wordsPerSecond = adjustedWPM / 60;
        
        // Count words (rough estimate)
        const wordCount = text.split(/\s+/).length;
        
        // Add some padding for natural pauses
        const baseDuration = (wordCount / wordsPerSecond) * 1000;
        const paddingFactor = 1.2; // 20% padding
        
        return Math.max(baseDuration * paddingFactor, 1000); // Minimum 1 second
    }

    /**
     * Display text with fade in/out animation
     */
    async displayText(text, duration) {
        if (!this.messagesElement) return;

        // Fade out current text
        this.messagesElement.style.opacity = '0';
        
        await new Promise(resolve => setTimeout(resolve, 200)); // Wait for fade out
        
        // Set new text and fade in
        this.messagesElement.textContent = text;
        this.messagesElement.style.opacity = '1';
        
        // Keep text visible for the duration
        return new Promise(resolve => setTimeout(resolve, duration));
    }

    /**
     * Play a single sentence with synchronized text
     */
    async playSentence(sentence) {
        if (typeof speechSynthesis === 'undefined') {
            // Fallback to text-only display
            const estimatedDuration = this.estimateSpeechDuration(sentence);
            await this.displayText(sentence, estimatedDuration);
            return;
        }

        return new Promise((resolve, reject) => {
            const utterance = new SpeechSynthesisUtterance(sentence);
            
            // Configure voice
            const selectedVoice = this.getSelectedVoice();
            if (selectedVoice) {
                utterance.voice = selectedVoice;
            }
            
            utterance.pitch = 0.5;
            utterance.rate = 0.9;
            utterance.volume = 1;

            let textDisplayPromise = null;
            let speechEnded = false;
            let textEnded = false;

            const checkCompletion = () => {
                if (speechEnded && textEnded) {
                    resolve();
                }
            };

            // Start text display immediately
            const estimatedDuration = this.estimateSpeechDuration(sentence, utterance.rate);
            textDisplayPromise = this.displayText(sentence, estimatedDuration).then(() => {
                textEnded = true;
                checkCompletion();
            });

            utterance.onstart = () => {
                console.log('Speech started:', sentence.substring(0, 50) + '...');
            };

            utterance.onend = () => {
                speechEnded = true;
                checkCompletion();
            };

            utterance.onerror = (event) => {
                console.error('Speech synthesis error:', event);
                speechEnded = true;
                checkCompletion();
            };

            this.currentUtterance = utterance;
            speechSynthesis.speak(utterance);
        });
    }

    /**
     * Play a message broken into sentences
     */
    async playMessage(text, onComplete = null) {
        if (this.isPlaying) {
            this.stop(); // Stop any current playback
        }

        this.isPlaying = true;
        const sentences = this.splitIntoSentences(text);
        
        try {
            for (let i = 0; i < sentences.length; i++) {
                if (!this.isPlaying) break; // Check if stopped
                
                const sentence = sentences[i];
                await this.playSentence(sentence);
                
                // Brief pause between sentences (except for the last one)
                if (i < sentences.length - 1 && this.isPlaying) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
        } catch (error) {
            console.error('Error playing message:', error);
        }

        this.isPlaying = false;
        this.currentUtterance = null;

        if (onComplete) {
            onComplete();
        }
    }

    /**
     * Stop current speech and clear text
     */
    stop() {
        this.isPlaying = false;
        
        if (typeof speechSynthesis !== 'undefined') {
            speechSynthesis.cancel();
        }
        
        this.currentUtterance = null;
        
        if (this.messagesElement) {
            this.messagesElement.style.opacity = '0';
            setTimeout(() => {
                if (this.messagesElement) {
                    this.messagesElement.textContent = '';
                }
            }, 200);
        }
    }

    /**
     * Set a loading message
     */
    setLoadingMessage(message = 'Loading...') {
        if (this.messagesElement) {
            this.messagesElement.textContent = message;
            this.messagesElement.style.opacity = '1';
        }
    }

    /**
     * Clear any displayed message
     */
    clearMessage() {
        if (this.messagesElement) {
            this.messagesElement.style.opacity = '0';
            setTimeout(() => {
                if (this.messagesElement) {
                    this.messagesElement.textContent = '';
                }
            }, 200);
        }
    }

    /**
     * Prime the audio context (call on user interaction)
     */
    primeAudioContext() {
        if (typeof speechSynthesis !== 'undefined') {
            speechSynthesis.cancel();
            const primer = new SpeechSynthesisUtterance(' ');
            primer.volume = 0;
            speechSynthesis.speak(primer);
        }
    }
}

// Export for use in other modules
window.UnifiedMessagingSystem = UnifiedMessagingSystem; 