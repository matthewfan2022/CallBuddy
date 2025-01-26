const WebSocket = require('ws');
const speech = require('@google-cloud/speech');
const OpenAI = require("openai");
const { URL } = require('url');
require('dotenv').config();


const keyFilePath = 'callbuddy-448720-755f8cd59efd.json';
const portNumber = 5002;

// OpenAI API Configuration
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY, // Use your OpenAI API key here
});

// Google Cloud Speech Client
const client = new speech.SpeechClient({
    keyFilename: keyFilePath,
});

// WebSocket Server
const wss = new WebSocket.Server({ port: portNumber });
console.log('WebSocket server is running on ws://localhost:'+portNumber.toString());

const conversationHistory = [];
const remainingPrompt = "Your tone should be cordial. You are handling a phone call for me. I will tell you what the other person says and you ONLY should provide a response from my perspective, nothing else. If you get a message that is very short and does not make sense in the context, respond with sorry i didn't get that do you mind repeating that. If the conversation ends after we say bye, simply respond with *hang up*."

// Handle WebSocket connections
wss.on('connection', (ws, req) => {
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
        .on('data', async (data) => {
            if (data.results[0] && data.results[0].alternatives[0]) {
                const user_transcription = data.results[0].alternatives[0].transcript
                console.log('Transcription:', user_transcription);

                // Add the user's transcription to the conversation history
                conversationHistory.push({ role: "user", content: user_transcription });

                try {
                    // Send the conversation history to GPT
                    const gptResponse = await openai.chat.completions.create({
                        model: "gpt-3.5-turbo", // Specify the model to use
                        messages: conversationHistory, // Pass the conversation history
                    });

                    const assistantResponse = gptResponse.choices[0].message.content;
                    console.log('GPT Response:', assistantResponse);

                    // Add GPT's response to the conversation history
                    conversationHistory.push({ role: "assistant", content: assistantResponse });

                    // Send GPT response back to WebSocket client
                    // ws.send(JSON.stringify({ event: 'gptResponse', response: assistantResponse }));
                } catch (error) {
                    console.error('Error communicating with GPT:', error);
                }
            }
        });
    
    ws.on('message', (message) => {
        try {
            const parsed = JSON.parse(message.toString('utf8'));
            
            if (parsed.type === 'promptText' && parsed.text) {
                const promptText = parsed.text; // Save the prompt text for future use
                console.log(`Received promptText: ${promptText}`);
                const initialPrompt = `Your goal is: ${promptText}. ${remainingPrompt}`;
                conversationHistory.push({ role: "system", content: initialPrompt });
            } else if (parsed.event === 'media' && parsed.media && parsed.media.payload) {
                const audioChunk = Buffer.from(parsed.media.payload, 'base64'); // Decode base64 payload
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