const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');
const fetch = require('node-fetch');

// রিমোট কনফিগারেশন ফাইলের URL
const CONFIG_URL = "https://animohubapk.com/api/config.json";

// Firebase Admin SDK ইনিশিয়ালাইজেশন (সবচেয়ে নিরাপদ পদ্ধতি ব্যবহার করে)
try {
    const serviceAccountJson = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
    const serviceAccount = JSON.parse(serviceAccountJson);
    
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: process.env.FIREBASE_DB_URL
        });
    }
} catch (e) {
    console.error('Firebase Admin Initialization Error:', e);
}

// এই ফাংশনটি ভেরিফিকেশন টোকেন যাচাই করে এবং সফল হলে Firebase এ ডেটা আপডেট করে
exports.handler = async (event) => {
    // CORS হেডার এবং HTTP মেথড চেক
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: 'Method Not Allowed' };
    }

    try {
        // --- ধাপ ১: রিমোট কনফিগারেশন ফাইল থেকে ডেটা লোড করা ---
        const configResponse = await fetch(CONFIG_URL);
        if (!configResponse.ok) throw new Error('Failed to fetch remote config');
        const config = await configResponse.json();

        // --- ধাপ ২: JWT টোকেন ভেরিফাই করা ---
        const { token } = JSON.parse(event.body);
        if (!token) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Token is required' }) };
        }

        const JWT_SECRET = process.env.JWT_SECRET;
        if (!JWT_SECRET) {
            throw new Error('Server configuration error: JWT_SECRET is not set.');
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const { deviceId, verification_token } = decoded;
        if (!deviceId || !verification_token) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid token payload' }) };
        }
        
        const db = admin.database();

        // --- ধাপ ৩ (নতুন): ডিভাইসটি ব্লক করা আছে কিনা তা চেক করা ---
        const blockSnapshot = await db.ref(`blocked_devices/${deviceId}`).once('value');
        if (blockSnapshot.exists()) {
            console.log(`Verification blocked for device: ${deviceId}`);
            return {
                statusCode: 403, // 403 Forbidden
                body: JSON.stringify({ error: 'This device has been blocked.' })
            };
        }

        // --- ধাপ ৪: Firebase-এ ভেরিফিকেশন ডেটা সেট করা ---
        // রিমোট কনফিগারেশন থেকে ভেরিফিকেশনের সময়কাল নির্ধারণ
        const verificationConfig = config.verification || {};
        const useHours = verificationConfig.useHours === true;
        let durationMillis;

        if (useHours) {
            const durationHours = verificationConfig.durationHours || 48;
            durationMillis = durationHours * 60 * 60 * 1000;
        } else {
            const durationMinutes = verificationConfig.durationMinutes || 60;
            durationMillis = durationMinutes * 60 * 1000;
        }
        
        const expirationTime = Date.now() + durationMillis;

        await db.ref(`verified_devices/${deviceId}`).set({
            expiration: expirationTime,
            last_token: verification_token,
            isPermanent: false, // নতুন ভেরিফিকেশন কখনো পার্মানেন্ট হবে না
            verified_at: new Date().toISOString()
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ message: `Successfully verified device: ${deviceId}` })
        };

    } catch (error) {
        // --- নতুন: আরও ভালো এরর হ্যান্ডলিং ---
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return { 
                statusCode: 401, // 401 Unauthorized
                body: JSON.stringify({ error: 'Invalid or expired token.' }) 
            };
        }
        
        console.error('Function Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};
