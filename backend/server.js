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

    //const encodedPromptText = encodeURIComponent(promptText); // Encode to make it URL-safe
    const websocketUrl = `wss://1cdb-128-62-40-57.ngrok-free.app/ws`;

    try {
        const call = await client.calls.create({
            to: phoneNumber,
            from: twilioPhoneNumber,
            twiml: `<Response>
                        <Start>
                            <Stream url="${websocketUrl}" track="inbound_track" />
                        </Start>
                        <Pause length="300" />
                        <Say>Ending call.</Say>
                    </Response>`,
        });
        

        res.status(200).json({ message: 'Call initiated', callSid: call.sid });
    } catch (error) {
        console.error('Error making call:', error);
        res.status(500).json({ error: 'Failed to make the call' });
    }

    const ws = new WebSocket(websocketUrl);

    ws.onopen = () => {
        // Send `promptText` as a message once WebSocket connection is open
        const promptMessage = JSON.stringify({ type: 'promptText', text: promptText });
        ws.send(promptMessage);
        ws.close();
    };
    
});

// Start Server
const PORT = process.env.PORT;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${PORT}`);
  });
