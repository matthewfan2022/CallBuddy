const WebSocket = require('ws');
const speech = require('@google-cloud/speech');
const OpenAI = require("openai");
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
ffmpeg.setFfmpegPath(ffmpegPath);
const { Readable } = require('stream');
const { ElevenLabsClient, stream, play } = require('elevenlabs');
require('dotenv').config();

const keyFilePath = 'callbuddy-448720-755f8cd59efd.json';
const portNumber = 5002;

//"deepseek-chat" or "gpt-3.5-turbo"
const LLMModel = 'deepseek-chat';

// OpenAI API Configuration
openai = null;
if (LLMModel.includes('gpt')) {
    openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY, // Use your OpenAI API key here
    });
} else if (LLMModel.includes('deepseek')) {
    openai = new OpenAI({
        baseURL: 'https://api.deepseek.com',
        apiKey: process.env.DEEPSEEK_API_KEY,
    });
} else {
    throw new Error('Invalid LLM Model Selected');
}


// Google Cloud Speech Client
const client = new speech.SpeechClient({
    keyFilename: keyFilePath,
});




const voiceId = 'JBFqnCBsd6RMkjVDRZzb';
const outputFormat = 'ulaw_8000';

// eleven labs client
const eleven_labs_client = new ElevenLabsClient({
    apiKey: process.env.ELEVEN_LABS_API_KEY,
});



// WebSocket Server
const wss = new WebSocket.Server({ port: portNumber });
console.log('WebSocket server is running on ws://localhost:'+portNumber.toString());
stream_sid = null;
const conversationHistory = [];

const remainingPrompt = "Your tone should be cordial. You are handling a phone call for me. I will tell you what the other person says and you ONLY should provide a response from my perspective, nothing else. If you get a message that is very short and does not make sense in the context, respond with sorry i didn't get that do you mind repeating that. "

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
                        model: LLMModel, // Specify the model to use
                        messages: conversationHistory, // Pass the conversation history
                    });

                    const assistantResponse = gptResponse.choices[0].message.content;
                    console.log('GPT Response:', assistantResponse);

                    // Add GPT's response to the conversation history
                    conversationHistory.push({ role: "assistant", content: assistantResponse });

                    // Generate the audio stream from Eleven Labs
                    const audioStream = await eleven_labs_client.textToSpeech.convert(voiceId, {
                        text: assistantResponse,
                        model_id: 'eleven_multilingual_v2',
                        output_format: outputFormat,
                    });
                
                    const readableStream = Readable.from(audioStream);
                    const audioArrayBuffer = await streamToArrayBuffer(readableStream);

                    ws.send(JSON.stringify({
                        event: "media",
                        streamSid: stream_sid,
                        media: {
                            payload: Buffer.from(audioArrayBuffer).toString('base64'),
                        },
                    }));
                    
                } catch (error) {
                    console.error('Error communicating with GPT:', error);
                }
            }
        });
    
    ws.on('message', (message) => {
        try {
            const parsed = JSON.parse(message.toString('utf8'));
            
            if (parsed.event === 'start') {
                stream_sid = parsed.streamSid;
                console.log(stream_sid)
            } else if (parsed.type === 'promptText' && parsed.text) {
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

    function streamToArrayBuffer(readableStream) {
        return new Promise((resolve, reject) => {
          const chunks = []; // Array to store data chunks
          readableStream.on('data', (chunk) => {
            chunks.push(chunk);
          });
          readableStream.on('end', () => {
            resolve(Buffer.concat(chunks).buffer); // Concatenate and convert to ArrayBuffer
          });
          readableStream.on('error', reject); // Handle stream errors
        });
      }
});