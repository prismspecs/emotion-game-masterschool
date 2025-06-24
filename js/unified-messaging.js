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
        this.currentTimeoutId = null; // To track display timeouts
        this.selectedVoiceName = 'auto'; // Default to auto-selection
        
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
            console.log('🎤 Voices loaded:', this.voices.length, 'voices available');
            if (this.voices.length > 0) {
                console.log('🎤 Available voices:', this.voices.map(v => `${v.name} (${v.lang})`));
                // Log the selected voice for debugging
                const selectedVoice = this.getSelectedVoice();
                if (selectedVoice) {
                    console.log('🎤 Auto-selected voice:', selectedVoice.name, '(' + selectedVoice.lang + ')');
                }
            }
        };

        populateVoices();
        if (speechSynthesis.onvoiceschanged !== undefined) {
            speechSynthesis.onvoiceschanged = populateVoices;
        }
        
        // Force voice loading for some browsers
        if (this.voices.length === 0) {
            console.log('🎤 No voices loaded initially, waiting for voices...');
            setTimeout(() => {
                populateVoices();
            }, 100);
        }
    }

    initializeMessageElement() {
        this.messagesElement = document.getElementById('messages');
        if (!this.messagesElement) {
            console.error('Messages element not found');
        }
    }

    /**
     * Detect if user is using Chrome browser
     */
    isChrome() {
        return /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
    }

    /**
     * Get the best available voice for speech synthesis
     * Prioritizes en-GB English male voice for Chrome users
     */
    getSelectedVoice() {
        if (this.voices.length === 0) return null;
        
        const isChromeBrowser = this.isChrome();
        console.log('🔍 Browser detection - Chrome:', isChromeBrowser);
        
        // For Chrome, prioritize en-GB English voices
        if (isChromeBrowser) {
            // Look for en-GB voices first
            const gbVoice = this.voices.find(voice => 
                voice.lang === 'en-GB' && 
                (voice.name.toLowerCase().includes('male') || voice.name.toLowerCase().includes('david') || voice.name.toLowerCase().includes('george'))
            ) || this.voices.find(voice => voice.lang === 'en-GB');
            
            if (gbVoice) {
                console.log('🎤 Selected en-GB voice for Chrome:', gbVoice.name);
                return gbVoice;
            }
        }
        
        // General auto-selection logic (for non-Chrome or if no en-GB found)
        return this.voices.find(voice => voice.name.includes('Google')) ||
               this.voices.find(voice => voice.name.includes('Microsoft')) ||
               this.voices.find(voice => voice.name === 'Alex') ||
               this.voices.find(voice => voice.lang === 'en-US') ||
               this.voices.find(voice => voice.lang.startsWith('en')) ||
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

        // Clear any existing timeout
        if (this.currentTimeoutId) {
            clearTimeout(this.currentTimeoutId);
        }

        // Fade out current text
        this.messagesElement.style.opacity = '0';
        
        // Use a cancellable timeout for the fade-out
        await new Promise(resolve => {
            this.currentTimeoutId = setTimeout(resolve, 200);
        });
        
        // Set new text and fade in
        this.messagesElement.textContent = text;
        this.messagesElement.style.opacity = '1';
        
        // Keep text visible for the duration, also cancellable
        return new Promise(resolve => {
            this.currentTimeoutId = setTimeout(resolve, duration);
        });
    }

    /**
     * Play a single sentence with synchronized text
     */
    async playSentence(sentence) {
        console.log('🎵 playSentence called with:', sentence);
        
        if (typeof speechSynthesis === 'undefined') {
            console.log('⚠️ Speech synthesis not available, using text-only fallback');
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
                console.log('🎤 Using voice:', selectedVoice.name);
            } else {
                console.log('⚠️ No voice selected, using default');
            }
            
            utterance.pitch = 0.5;
            utterance.rate = 0.9;
            utterance.volume = 1;

            let textDisplayPromise = null;
            let speechEnded = false;
            let textEnded = false;
            let timeoutId = null;
            let speechStarted = false;

            const checkCompletion = () => {
                if (speechEnded && textEnded) {
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                    }
                    resolve();
                }
            };
            
            // Shorter timeout to detect if speech actually starts
            const speechStartTimeout = setTimeout(() => {
                if (!speechStarted) {
                    console.warn('🚨 Speech synthesis failed to start within 2 seconds for:', sentence.substring(0, 50));
                    console.log('🔧 Attempting to fix by canceling and retrying...');
                    speechSynthesis.cancel();
                    
                    // Try once more with a fresh utterance
                    const retryUtterance = new SpeechSynthesisUtterance(sentence);
                    if (selectedVoice) {
                        retryUtterance.voice = selectedVoice;
                    }
                    retryUtterance.pitch = 0.5;
                    retryUtterance.rate = 0.9;
                    retryUtterance.volume = 1;
                    
                    retryUtterance.onstart = () => {
                        console.log('🔄 Retry speech started:', sentence.substring(0, 50) + '...');
                        speechStarted = true;
                    };
                    
                    retryUtterance.onend = () => {
                        console.log('🔄 Retry speech ended:', sentence.substring(0, 50) + '...');
                        speechEnded = true;
                        checkCompletion();
                    };
                    
                    retryUtterance.onerror = (event) => {
                        console.error('🔄 Retry speech synthesis error:', event);
                        speechEnded = true;
                        checkCompletion();
                    };
                    
                    // Final timeout for retry
                    setTimeout(() => {
                        if (!speechStarted) {
                            console.warn('🚨 Retry also failed, marking speech as ended');
                            speechEnded = true;
                            checkCompletion();
                        }
                    }, 3000);
                    
                    this.currentUtterance = retryUtterance;
                    speechSynthesis.speak(retryUtterance);
                }
            }, 2000);
            
            // Main timeout to prevent hanging
            const timeoutEstimatedDuration = this.estimateSpeechDuration(sentence, utterance.rate);
            const maxDuration = Math.max(timeoutEstimatedDuration * 2, 15000); // Increased to 15 seconds
            timeoutId = setTimeout(() => {
                console.warn('⚠️ TTS timeout reached for sentence:', sentence.substring(0, 50));
                speechEnded = true;
                textEnded = true;
                checkCompletion();
            }, maxDuration);

            // Start text display immediately
            const displayEstimatedDuration = this.estimateSpeechDuration(sentence, utterance.rate);
            textDisplayPromise = this.displayText(sentence, displayEstimatedDuration).then(() => {
                textEnded = true;
                checkCompletion();
            });

            utterance.onstart = () => {
                console.log('🎤 Speech started:', sentence.substring(0, 50) + '...');
                speechStarted = true;
                clearTimeout(speechStartTimeout);
            };

            utterance.onend = () => {
                console.log('🎤 Speech ended:', sentence.substring(0, 50) + '...');
                speechEnded = true;
                checkCompletion();
            };

            utterance.onerror = (event) => {
                console.error('🚨 Speech synthesis error:', event);
                console.log('🔧 Error details:', {
                    error: event.error,
                    type: event.type,
                    charIndex: event.charIndex,
                    elapsedTime: event.elapsedTime
                });
                speechEnded = true;
                checkCompletion();
            };

            // Debug: Check speechSynthesis state
            console.log('🔍 SpeechSynthesis state:', {
                speaking: speechSynthesis.speaking,
                pending: speechSynthesis.pending,
                paused: speechSynthesis.paused,
                voicesLength: speechSynthesis.getVoices().length
            });

            this.currentUtterance = utterance;
            speechSynthesis.speak(utterance);
            
            // Additional debug: Check if utterance was queued
            setTimeout(() => {
                console.log('🔍 After speak() call - SpeechSynthesis state:', {
                    speaking: speechSynthesis.speaking,
                    pending: speechSynthesis.pending,
                    paused: speechSynthesis.paused
                });
            }, 100);
        });
    }

    /**
     * Play a message broken into sentences
     */
    async playMessage(text, onComplete = null) {
        console.log('🎵 playMessage called with:', text.substring(0, 50) + '...');
        console.log('🎵 Current isPlaying state:', this.isPlaying);
        
        if (this.isPlaying) {
            console.log('🛑 Stopping current playback...');
            this.stop(); // Stop any current playback
        }

        this.isPlaying = true;
        const sentences = this.splitIntoSentences(text);
        console.log('🎵 Split into', sentences.length, 'sentences:', sentences);
        
        try {
            for (let i = 0; i < sentences.length; i++) {
                if (!this.isPlaying) {
                    console.log('🛑 Playback stopped, breaking loop at sentence', i);
                    break; // Check if stopped
                }
                
                const sentence = sentences[i];
                console.log(`🎵 Playing sentence ${i + 1}/${sentences.length}: "${sentence}"`);
                await this.playSentence(sentence);
                console.log(`✅ Sentence ${i + 1} completed`);
                
                // Brief pause between sentences (except for the last one)
                if (i < sentences.length - 1 && this.isPlaying) {
                    console.log('⏸️ Brief pause between sentences...');
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
            console.log('✅ All sentences completed');
        } catch (error) {
            console.error('❌ Error playing message:', error);
        } finally {
            console.log('🏁 playMessage finished, setting isPlaying to false');
            this.isPlaying = false;
            this.currentUtterance = null;
        }

        // Call the completion callback if provided
        if (onComplete) {
            onComplete();
        }
    }

    /**
     * Stop current speech and clear text
     */
    stop() {
        console.log('🛑 stop() called, current isPlaying:', this.isPlaying);
        this.isPlaying = false;

        // Clear any pending timeouts for text display
        if (this.currentTimeoutId) {
            console.log('⏰ Clearing timeout:', this.currentTimeoutId);
            clearTimeout(this.currentTimeoutId);
            this.currentTimeoutId = null;
        }
        
        if (typeof speechSynthesis !== 'undefined') {
            console.log('🔇 Cancelling speech synthesis');
            speechSynthesis.cancel();
        }
        
        this.currentUtterance = null;
        console.log('🛑 stop() completed');
        
        if (this.messagesElement) {
            this.messagesElement.style.opacity = '0';
            // Use a timeout to clear the text after the fade-out completes.
            // This timeout is self-contained and doesn't need to be tracked.
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
        // Use the more robust stop() method to halt everything.
        this.stop();
    }

    /**
     * Prime the audio context (call on user interaction)
     */
    primeAudioContext() {
        console.log('🔧 Priming audio context...');
        if (typeof speechSynthesis !== 'undefined') {
            speechSynthesis.cancel();
            
            // Test with a very short utterance to see if TTS is working
            const testUtterance = new SpeechSynthesisUtterance('test');
            testUtterance.volume = 0.1; // Very quiet
            testUtterance.rate = 2.0; // Very fast
            
            testUtterance.onstart = () => {
                console.log('✅ TTS test successful - audio context primed');
            };
            
            testUtterance.onerror = (event) => {
                console.error('❌ TTS test failed:', event);
            };
            
            speechSynthesis.speak(testUtterance);
            
            console.log('🔧 Audio context priming initiated');
        } else {
            console.warn('⚠️ Speech synthesis not available for priming');
        }
    }

    /**
     * Test if speech synthesis is working properly
     */
    async testSpeechSynthesis() {
        console.log('🧪 Testing speech synthesis...');
        
        if (typeof speechSynthesis === 'undefined') {
            console.log('❌ Speech synthesis not supported');
            return false;
        }

        return new Promise((resolve) => {
            const testUtterance = new SpeechSynthesisUtterance('test');
            testUtterance.volume = 0; // Silent
            testUtterance.rate = 3.0; // Very fast
            
            let testPassed = false;
            
            const timeout = setTimeout(() => {
                if (!testPassed) {
                    console.log('❌ Speech synthesis test timed out');
                    resolve(false);
                }
            }, 2000);
            
            testUtterance.onstart = () => {
                console.log('✅ Speech synthesis test passed');
                testPassed = true;
                clearTimeout(timeout);
                resolve(true);
            };
            
            testUtterance.onend = () => {
                if (!testPassed) {
                    console.log('❌ Speech synthesis test failed - onend without onstart');
                    clearTimeout(timeout);
                    resolve(false);
                }
            };
            
            testUtterance.onerror = (event) => {
                console.error('❌ Speech synthesis test error:', event);
                clearTimeout(timeout);
                resolve(false);
            };
            
            speechSynthesis.speak(testUtterance);
        });
    }


}

// Export for use in other modules
window.UnifiedMessagingSystem = UnifiedMessagingSystem; 