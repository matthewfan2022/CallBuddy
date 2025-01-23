const WebSocket = require('ws');
const speech = require('@google-cloud/speech');
const { Writable } = require('stream');

// Google Cloud Speech Client
const client = new speech.SpeechClient();

// WebSocket Server
const wss = new WebSocket.Server({ port: 5002 });
console.log('WebSocket server is running on ws://localhost:5002');

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
        interimResults: true, // Get partial results
    };

    const recognizeStream = client
        .streamingRecognize(request)
        .on('error', (err) => console.error('Error:', err))
        .on('data', (data) => {
            if (data.results[0] && data.results[0].alternatives[0]) {
                console.log('Transcription:', data.results[0].alternatives[0].transcript);
            }
        });

    // Handle audio stream from Twilio
    ws.on('message', (message) => {
        recognizeStream.write(message);
    });

    // Clean up when connection closes
    ws.on('close', () => {
        console.log('Connection closed');
        recognizeStream.end();
    });
});