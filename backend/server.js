require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const twilio = require('twilio');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Twilio credentials from .env
const accountSid = process.env.TWILIO_ACCOUNT_SID; // Your Twilio Account SID
const authToken = process.env.TWILIO_AUTH_TOKEN;   // Your Twilio Auth Token
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER; // Your Twilio phone number

const client = twilio(accountSid, authToken);


  
// Test Endpoint
app.get('/', (req, res) => {
    res.send('Backend is running!');
});

// Twilio Call Endpoint
app.post('/call', async (req, res) => {
    const { phoneNumber, promptText } = req.body;

    if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number is required' });
    }

    if (!promptText) {
        return res.status(400).json({ error: 'Prompt text is required' });
    }

    console.log(`Prompt received: ${promptText}`); // Log the promptText

    try {
        const call = await client.calls.create({
            to: phoneNumber,
            from: twilioPhoneNumber,
            twiml: `<Response>
                        <Say>Hello! I will transcribe your audio in real-time.</Say>
                        
                    </Response>`,
        });
        // <Start>
        //                     <Stream url="wss://your-server-url/ws" track="inbound_track" />
        //                 </Start>

        res.status(200).json({ message: 'Call initiated', callSid: call.sid });
    } catch (error) {
        console.error('Error making call:', error);
        res.status(500).json({ error: 'Failed to make the call' });
    }
});

// Handle the transcribed speech
app.post('/handle_speech', async (req, res) => {
    const transcription = req.body.SpeechResult; // This is the transcribed text
    console.log(`User said: ${transcription}`);

    const twiml = new twilio.twiml.VoiceResponse();

    // Repeat back what the user said
    twiml.say(`${transcription}`);

    res.type('text/xml');
    res.send(twiml.toString());
});

// Start Server
const PORT = process.env.PORT;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${PORT}`);
  });
