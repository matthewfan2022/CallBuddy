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
const LLMModel = 'gpt-3.5-turbo';

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

const remainingPrompt = "You are handling a phone call for me. I will tell you what the other person says and you ONLY should provide a response from my perspective, nothing else. If something does not make sense, respond with sorry can you repeat that. If you need to press a number pad key, output number in between astericks e.g. *1*. If the conversation ends and you are going to hang up, output *XXX*."

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

                    const result = extractAndRemoveAsterisks(assistantResponse);

                    sendKeyPressesToTwilio(result.actions, ws);

                    // Generate the audio stream from Eleven Labs
                    const audioStream = await eleven_labs_client.textToSpeech.convert(voiceId, {
                        text: result.message,
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

                    if (result.actions.includes(x = "XXX")) {
                        console.log(`"${x}" found in extracted strings. Closing WebSocket.`);
                        ws.close();
                    } 
                    
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
                const initialPrompt = `${remainingPrompt} Your goal is: ${promptText}. `;
                console.log(initialPrompt);
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
    ws.on('close', async () => { 
        try {
            if (conversationHistory.length > 1) {
                conversationHistory.push({ role: "user", content: "Summarize this conversation." });
    
                const gptResponse = await openai.chat.completions.create({
                    model: LLMModel, 
                    messages: conversationHistory,
                });
    
                if (!gptResponse || !gptResponse.choices || gptResponse.choices.length === 0) {
                    throw new Error('GPT response is empty or invalid');
                }
    
                const assistantResponse = gptResponse.choices[0].message.content;
                console.log('Call Summary:', assistantResponse);
            }
        } catch (error) {
            console.error('Error generating conversation summary:', error);
        }
    
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
    
    function extractAndRemoveAsterisks(str) {
        const matches = [];
        const updatedStr = str.replace(/\*(.*?)\*/g, (_, match) => {
            matches.push(match); // Capture the content between asterisks
            return ''; // Remove the match from the string
        });
    
        return {
            actions: matches,
            message: updatedStr.trim(),
        };
    }

    function sendKeyPressesToTwilio(actions, ws) {
        actions.forEach(action => {
            // Check if the action is a valid single-digit number
            if (/^[0-9]$/.test(action)) {
                // Send the number as a DTMF tone through the WebSocket
                ws.send(JSON.stringify({
                    event: "dtmf",
                    streamSid: stream_sid, // Replace with your actual Stream SID
                    dtmf: {
                        digits: action
                    }
                }));
                console.log(`Sent key press: ${action}`);
            } else {
                console.log(`Skipped: ${action} is not a valid single-digit number.`);
            }
        });
    }

});