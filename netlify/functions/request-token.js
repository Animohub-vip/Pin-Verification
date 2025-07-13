const jwt = require('jsonwebtoken');


const JWT_SECRET = process.env.JWT_SECRET;

exports.handler = async function(event) {
    
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
        
        if (!JWT_SECRET) {
            console.error('Server configuration error: JWT_SECRET is not set.');
            return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration error.' }) };
        }

        
        const { deviceId } = JSON.parse(event.body);

        
        if (!deviceId) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Device ID is required.' }) };
        }

       
        const token = jwt.sign(
            { deviceId: deviceId },
            JWT_SECRET
        );

        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ token: token })
        };

    } catch (error) {
        
        console.error("Token Generation Error:", error.message);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'An internal server error occurred.' })
        };
    }
};
