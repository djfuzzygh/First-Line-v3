/**
 * FirstLine Multi-Channel Simulator
 * Logic for SMS, Voice, and USSD simulation
 */

const API_BASE = 'http://localhost:8080';

// DOM Elements
const tabs = document.querySelectorAll('.tab-btn');
const panels = document.querySelectorAll('.simulator-panel');

// Tab Switching
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        panels.forEach(p => p.classList.remove('active'));

        tab.classList.add('active');
        const channel = tab.dataset.channel;
        document.getElementById(`${channel}-simulator`).classList.add('active');
    });
});

// --- SMS LOGIC ---
const smsInput = document.getElementById('sms-input');
const smsSend = document.getElementById('sms-send');
const smsHistory = document.getElementById('sms-history');
const smsEncounterSpan = document.getElementById('sms-encounter-id');
const smsStepSpan = document.getElementById('sms-step');

let currentPhoneNumber = '+1' + Math.floor(Math.random() * 9000000000 + 1000000000);

function addSMSMessage(text, type) {
    const msg = document.createElement('div');
    msg.className = `message ${type}`;
    msg.textContent = text;
    smsHistory.appendChild(msg);
    smsHistory.scrollTop = smsHistory.scrollHeight;
}

async function sendSMS() {
    const text = smsInput.value.trim();
    if (!text) return;

    addSMSMessage(text, 'sent');
    smsInput.value = '';

    try {
        const response = await fetch(`${API_BASE}/sms/webhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phoneNumber: currentPhoneNumber,
                message: text
            })
        });

        const data = await response.json();

        // Simulate network delay for AI response
        setTimeout(() => {
            // In a real scenario, the backend would trigger an SNS message back
            // Here we just mock the immediate acknowledgment as the "response"
            // because our simplified local handler returns the triage result directly
            // or we'd need a polling mechanism.

            // For the demo, let's assume the response is "Message Processed"
            // and we rely on the backend logs for actual AI content.
            // But let's try to get the encounter ID if returned.
            if (data.status === 'success') {
                addSMSMessage("System: Processing your message...", 'system');
            }
        }, 500);

    } catch (err) {
        addSMSMessage("Error connecting to backend", 'system');
    }
}

smsSend.addEventListener('click', sendSMS);
smsInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendSMS();
});

// --- USSD LOGIC ---
const ussdContent = document.getElementById('ussd-content');
const ussdInput = document.getElementById('ussd-input');
const ussdSend = document.getElementById('ussd-send');
const ussdSessionSpan = document.getElementById('ussd-session-id');

let ussdSessionId = 'SIM_' + Math.random().toString(36).substr(2, 9).toUpperCase();
ussdSessionSpan.textContent = ussdSessionId;

async function sendUSSD() {
    const text = ussdInput.value.trim();
    ussdInput.value = '';

    try {
        const response = await fetch(`${API_BASE}/ussd/callback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: ussdSessionId,
                phoneNumber: currentPhoneNumber,
                text: text
            })
        });

        const resText = await response.text();
        ussdContent.textContent = resText.replace('CON ', '').replace('END ', '');

        if (resText.startsWith('END')) {
            setTimeout(() => {
                ussdContent.textContent = "Session Ended.\nRefresh to restart.";
            }, 3000);
        }
    } catch (err) {
        ussdContent.textContent = "Connection Error";
    }
}

ussdSend.addEventListener('click', sendUSSD);

// --- VOICE LOGIC ---
const voiceLog = document.getElementById('voice-logs');
const voiceInit = document.getElementById('voice-initiate');

function addVoiceLog(text) {
    const log = document.createElement('div');
    log.className = 'log-entry';
    log.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
    voiceLog.prepend(log);
}

voiceInit.addEventListener('click', async () => {
    addVoiceLog("Initiating call...");

    try {
        const response = await fetch(`${API_BASE}/voice/callback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                callId: 'VOICE_SIM_' + Date.now(),
                phoneNumber: currentPhoneNumber
            })
        });

        const twiml = await response.text();
        addVoiceLog("Call Connected.");

        // Parse TwiML to show what Polly would say
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(twiml, "text/xml");
        const says = xmlDoc.getElementsByTagName("Say");

        for (let say of says) {
            addVoiceLog(`Polly: "${say.childNodes[0].nodeValue}"`);
        }
    } catch (err) {
        addVoiceLog("Call Failed: Backend unreachable");
    }
});
