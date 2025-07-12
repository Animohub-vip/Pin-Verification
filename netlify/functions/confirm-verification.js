const jwt = require('jsonwebtoken');
const { MongoClient } = require('mongodb');
const fetch = require('node-fetch');

const CONFIG_URL = "https://animohubapk.com/api/config.json";

const MONGO_URI = "mongodb://animohub:animohub@193.203.162.186:27017/admin";
const DB_NAME = "admin"; // if your collections are under 'admin' database, otherwise set your specific db name

exports.handler = async (event) => {
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

  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db(DB_NAME);

    const configResponse = await fetch(CONFIG_URL);
    if (!configResponse.ok) throw new Error('Failed to fetch remote config');
    const config = await configResponse.json();

    const { token } = JSON.parse(event.body);
    if (!token) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Token is required' }) };
    }

    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) throw new Error('Server configuration error: JWT_SECRET is not set.');

    const decoded = jwt.verify(token, JWT_SECRET);
    const { deviceId } = decoded;

    if (!deviceId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid token payload. Device ID is missing.' }) };
    }

    // 👉 Check if blocked
    const block = await db.collection('blocked_devices').findOne({ deviceId });
    if (block) {
      console.log(`Verification blocked for device: ${deviceId}`);
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'This device has been blocked.' })
      };
    }

    // 👉 Calculate expiration
    const verificationConfig = config.verification || {};
    const useHours = verificationConfig.useHours === true;
    const durationMillis = useHours
      ? (verificationConfig.durationHours || 48) * 60 * 60 * 1000
      : (verificationConfig.durationMinutes || 60) * 60 * 1000;

    const expirationTime = Date.now() + durationMillis;

    // 👉 Insert/Update verification record
    await db.collection('verified_devices').updateOne(
      { deviceId },
      {
        $set: {
          expiration: expirationTime,
          isPermanent: false,
          verified_at: new Date().toISOString()
        }
      },
      { upsert: true }
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: `Successfully verified device: ${deviceId}` })
    };

  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired token.' }) };
    }
    console.error('Function Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'An internal server error occurred. Please contact support.' })
    };
  } finally {
    await client.close();
  }
};
