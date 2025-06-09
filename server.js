import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';

dotenv.config();

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

let personaPrompt = '';

async function loadPersona() {
  try {
    const personaPath = path.resolve(process.cwd(), 'config/prompt-engineering.json');
    const data = await fs.readFile(personaPath, 'utf-8');
    const personas = JSON.parse(data);
    if (personas.personas && personas.personas.length > 0) {
      personaPrompt = personas.personas[0].prompt;
      console.log('Persona loaded successfully.');
    } else {
      console.log('No personas found in config file.');
    }
  } catch (error) {
    console.error('Failed to load persona:', error);
  }
}

app.post('/api/openai', async (req, res) => {
    const { prompt } = req.body;
    
    const fullPrompt = `${personaPrompt}\n\n${prompt}`;

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: fullPrompt }],
                max_tokens: 50,
                temperature: 0.8
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('OpenAI API Error:', errorData);
            return res.status(response.status).json({ error: 'OpenAI API request failed' });
        }

        const data = await response.json();
        res.json(data);

    } catch (error) {
        console.error('Server Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

async function startServer() {
    await loadPersona();
    app.listen(port, () => {
        console.log(`Server listening at http://localhost:${port}`);
    });
}

startServer(); 