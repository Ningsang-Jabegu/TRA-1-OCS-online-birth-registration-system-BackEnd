import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import router from './route/route.js';

const app = express();

// Configure CORS
app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        callback(null, true);
    },
    credentials: true
}));

// Helper function to create rate limiters with custom messages
const createLimiter = (type) => rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // limit each IP to 10 requests per windowMs
    message: `Too many ${type} attempts from this IP, please try again later.`,
    keyGenerator: (req) => {
        return req.ip + '-' + req.headers['user-agent'];
    }
});

const loginLimiter = createLimiter('login');
const registerLimiter = createLimiter('registration');

// Apply the rate limiting middleware to the login and register routes
app.use('/api/login', loginLimiter);
app.use('/api/register', registerLimiter);

// Middleware to parse JSON bodies
app.use(express.json());

// Use the imported router for all routes
app.use('/', router);

// Define the port number
const PORT = process.env.PORT || 3000;

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});