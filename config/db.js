// config/db.js
const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.HORIZON_MONGODB_URI, {
            // Mongoose 6+ no longer needs these options, they are default:
            // useNewUrlParser: true,
            // useUnifiedTopology: true,
            // useCreateIndex: true, // Not needed
            // useFindAndModify: false, // Not needed
        });

        console.log(`ScaleUp Horizon MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error connecting to ScaleUp Horizon MongoDB: ${error.message}`);
        process.exit(1); // Exit process with failure
    }
};

module.exports = connectDB;
