import mongoose from "mongoose";

declare global {
  // eslint-disable-next-line no-var
  var _mongooseConnection: typeof mongoose | null; // Stores the resolved mongoose instance
  // eslint-disable-next-line no-var
  var _mongooseConnectionPromise: Promise<typeof mongoose> | null; // Stores the promise of the connection
}

const MONGODB_URI = process.env.MONGODB_ATLAS_CONNECTION_STRING || "";

if (!MONGODB_URI) {
  throw new Error("Please define the MONGODB_ATLAS_CONNECTION_STRING environment variable inside .env.local");
}

async function dbConnect() {
  let cachedConnection = globalThis._mongooseConnection;
  let cachedPromise = globalThis._mongooseConnectionPromise;

  if (cachedConnection) {
    console.log("Using cached Mongoose connection");
    return cachedConnection;
  }

  if (!cachedPromise) {
    const opts = {
      bufferCommands: false, // Disables Mongoose's buffering. Recommended for serverless.
    };

    // Store the connection promise on the global object
    cachedPromise = mongoose
      .connect(MONGODB_URI, opts)
      .then(connectedMongooseInstance => {
        console.log("New Mongoose connection established");
        // Once resolved, store the actual connection instance on the global object
        globalThis._mongooseConnection = connectedMongooseInstance;
        return connectedMongooseInstance;
      })
      .catch(error => {
        console.error("Mongoose connection failed:", error);
        // On error, reset the promise and connection on the global object
        globalThis._mongooseConnectionPromise = null;
        globalThis._mongooseConnection = null;
        throw error; // Re-throw the error to indicate failure
      });

    // Assign the promise to the global object immediately so subsequent calls await it
    globalThis._mongooseConnectionPromise = cachedPromise;
  }

  // Await the promise to get the connected Mongoose instance
  try {
    const connection = await cachedPromise;
    // Update local cachedConnection reference just in case it was resolved after this function started
    cachedConnection = connection;
    return connection;
  } catch (e) {
    // Error already handled in .catch() above; just re-throw
    throw e;
  }
}

export default dbConnect;
