const WebSocket = require('ws');
const speech = require('@google-cloud/speech');
const { Writable } = require('stream');
const fs = require('fs');

const keyFilePath = 'callbuddy-448720-755f8cd59efd.json';
const portNumber = 5002

// Google Cloud Speech Client
const client = new speech.SpeechClient({
    keyFilename: keyFilePath,
});

// WebSocket Server
const wss = new WebSocket.Server({ port: portNumber });
console.log('WebSocket server is running on ws://localhost:'+portNumber.toString());

// Handle WebSocket connections
wss.on('connection', (ws) => {
    console.log('New connection established');

    // Configure Google Cloud Speech-to-Text Streaming
    const request = {
        config: {
            encoding: 'MULAW',
            sampleRateHertz: 8000, // Twilio streams audio at 8kHz
            languageCode: 'en-US',
        },
        interimResults: false, // Get partial results
    };

    const recognizeStream = client
        .streamingRecognize(request)
        .on('error', (err) => console.error('Error:', err))
        .on('data', (data) => {
            if (data.results[0] && data.results[0].alternatives[0]) {
                console.log('Transcription:', data.results[0].alternatives[0].transcript);
            }
        });
    
    ws.on('message', (message) => {
        try {
            const parsed = JSON.parse(message.toString('utf8'));
            
            // Handle `media` events only
            if (parsed.event === 'media' && parsed.media && parsed.media.payload) {
                const audioChunk = Buffer.from(parsed.media.payload, 'base64'); // Decode base64 payload
                fs.appendFileSync(audioFilePath, audioChunk); // Save raw audio for debugging
                recognizeStream.write(audioChunk); // Send to Google Cloud for transcription
            } else if (parsed.event !== 'media') {
                console.log('Received non-audio event:', parsed.event);
            }
        } catch (err) {
            console.error('Error parsing message:', err);
        }
    });

    // Handle any remaining audio when the connection closes
    ws.on('close', () => {
        console.log('WebSocket connection closed');
        recognizeStream.end();
    });
        
});