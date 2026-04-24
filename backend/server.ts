import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import path from 'path';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3001;
const PYTHON_SCRIPT = path.join(__dirname, '../api.py');

app.post('/api/intent', (req, res) => {
    const { prompt } = req.body;
    
    if (!prompt) {
        return res.status(400).json({ status: 'error', message: 'Prompt is required' });
    }

    console.log(`Received prompt: ${prompt}`);

    // Call the Python script
    exec(`python "${PYTHON_SCRIPT}" "${prompt}"`, (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            return res.status(500).json({ status: 'error', message: 'Internal Server Error' });
        }
        
        try {
            // Parse the JSON returned from python
            const result = JSON.parse(stdout.trim());
            res.json(result);
        } catch (e) {
            console.error('Failed to parse Python output:', stdout);
            res.status(500).json({ status: 'error', message: 'Failed to parse python response', raw: stdout });
        }
    });
});

app.listen(PORT, () => {
    console.log(`Agent API Server running on http://localhost:${PORT}`);
});
