const admin = require('firebase-admin');

// Firebase Admin SDK ইনিশিয়ালাইজেশন (যদি আগে না করা থাকে)
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    const databaseURL = process.env.FIREBASE_DATABASE_URL;

    if (admin.apps.length === 0) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: databaseURL
        });
    }
} catch (e) {
    console.error('Firebase Admin SDK initialization failed:', e);
}

exports.handler = async function(event, context) {
    console.log("Starting cleanup of expired devices...");

    try {
        const db = admin.database();
        const ref = db.ref('verified_devices');
        const now = Date.now();
        let deletedCount = 0;

        // সকল ভেরিফাইড ডিভাইসের ডেটা একবার আনা হচ্ছে
        const snapshot = await ref.once('value');
        const devices = snapshot.val();

        if (!devices) {
            console.log("No devices found in 'verified_devices'. Cleanup not needed.");
            return {
                statusCode: 200,
                body: "No devices to clean up."
            };
        }

        const updates = {};
        for (const deviceId in devices) {
            const deviceData = devices[deviceId];
            // নিশ্চিত করুন যে 'expiration' ফিল্ডটি বিদ্যমান
            if (deviceData.expiration && deviceData.expiration < now) {
                // সরাসরি ডিলিট না করে, একটি আপডেটে 'null' হিসেবে সেট করা হচ্ছে
                // এটি একটি অ্যাটমিক অপারেশনে সব ডিলিট সম্পন্ন করে
                updates[deviceId] = null;
                deletedCount++;
                console.log(`Marking device ${deviceId} for deletion. Expired at: ${new Date(deviceData.expiration).toISOString()}`);
            }
        }

        if (Object.keys(updates).length > 0) {
            // একসাথে সব মেয়াদোত্তীর্ণ এন্ট্রি মুছে ফেলা হচ্ছে
            await ref.update(updates);
            console.log(`Successfully deleted ${deletedCount} expired device(s).`);
            return {
                statusCode: 200,
                body: `Successfully deleted ${deletedCount} expired device(s).`
            };
        } else {
            console.log("No expired devices found to delete.");
            return {
                statusCode: 200,
                body: "No expired devices found."
            };
        }

    } catch (error) {
        console.error("Error during database cleanup:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to clean up database.' })
        };
    }
};
