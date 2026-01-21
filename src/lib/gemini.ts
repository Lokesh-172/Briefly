import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is not set in environment variables.");
}

// Initialize the GoogleGenerativeAI client
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const ai = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

export default ai;
