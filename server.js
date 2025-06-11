import express from 'express';
import cors from 'cors';
import router from './route/route.js';

const app = express();

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        callback(null, true);
    },
    credentials: true
}));
app.use(express.json());

// Use the imported router for all routes
app.use('/', router);

// Define the port number
const PORT = process.env.PORT || 3000;

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
