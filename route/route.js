import fs from 'fs';
import csv from 'csv-parser';
import express from 'express';
import { log } from 'console';

const router = express.Router();

// Root route
router.get('/', (req, res) => {
    res.send('Server is ready for serving.');
});

// Login route
router.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const csvFilePath = './db/Users_Accounts_Information.csv';
    let authenticated = false;

    try {
        if (!fs.existsSync(csvFilePath)) {
            return res.status(404).json({ success: false, message: 'User database not found' });
        }

        fs.createReadStream(csvFilePath)
            .pipe(csv())
            .on('data', (row) => {
                if (row.EMAIL === email && row.PASSWORD === password) {
                    authenticated = true;
                }
            })
            .on('end', () => {
                if (authenticated) {
                    res.json({ success: true, message: 'Login successful' });
                } else {
                    res.json({ success: false, message: 'Invalid email or password' });
                }
            });
    } catch (error) {
        console.error('Error reading CSV:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// Register route
// Register route
router.post('/api/register', async (req, res) => {
    const { name, email, password, salt, role, secretCode } = req.body;
    if (
        !name ||
        !email ||
        !password ||
        !salt ||
        !role ||
        (role.toLowerCase() === "administrator" && !secretCode)
    ) {
        return res.status(400).json({ error: 'All fields are required.' });
    }

    const csvFilePath = './db/Users_Accounts_Information.csv';
    const headers = 'NAME,EMAIL,PASSWORD(hash),SALT,ROLE,SECRET_CODE\n';

    try {
        // Check if user already exists
        let userExists = false;
        if (fs.existsSync(csvFilePath)) {
            await new Promise((resolve, reject) => {
                fs.createReadStream(csvFilePath)
                    .pipe(csv())
                    .on('data', (row) => {
                        if (row.EMAIL === email) {
                            userExists = true;
                        }
                    })
                    .on('end', resolve)
                    .on('error', reject);
            });
        }

        if (userExists) {
            return res.status(409).json({ error: 'User with this email already exists.' });
        }

        // For non-admin roles, secretCode should be 0
        const finalSecretCode = role.toLowerCase() === "administrator" ? secretCode : "0";

        // Prepare new user row
        const newRow = `${name},${email},${password},${salt},${role},${finalSecretCode}\n`;

        // If file doesn't exist, write headers first
        if (!fs.existsSync(csvFilePath)) {
            fs.writeFileSync(csvFilePath, headers, 'utf8');
        }

        // Append new user
        fs.appendFileSync(csvFilePath, newRow, 'utf8');

        res.status(201).json({ message: 'Registration successful.' });
    } catch (error) {
        console.error('Error saving user:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;