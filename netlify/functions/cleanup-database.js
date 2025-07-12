const { MongoClient } = require('mongodb');

const MONGO_URI = "mongodb://animohub:animohub@193.203.162.186:27017/admin";
const DB_NAME = "admin"; // change if your data is under another db

exports.handler = async function(event, context) {
  console.log("Starting cleanup of expired devices...");

  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const collection = db.collection('verified_devices');

    const now = Date.now();
    let deletedCount = 0;

    // Fetch all devices
    const devices = await collection.find({}).toArray();

    if (!devices || devices.length === 0) {
      console.log("No devices found in 'verified_devices'. Cleanup not needed.");
      return {
        statusCode: 200,
        body: "No devices to clean up."
      };
    }

    // Find expired devices
    const expiredDeviceIds = devices
      .filter(device => device.expiration && device.expiration < now)
      .map(device => device.deviceId);

    if (expiredDeviceIds.length > 0) {
      // Delete expired devices
      const result = await collection.deleteMany({ deviceId: { $in: expiredDeviceIds } });
      deletedCount = result.deletedCount;

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
  } finally {
    await client.close();
  }
};
