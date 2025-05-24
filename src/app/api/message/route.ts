import { db } from "@/db";
import ai from "@/lib/gemini"; // This now exports the gemini-1.5-flash GenerativeModel instance
import pinecone from "@/lib/pinecone";
import { sendMessageValidator } from "@/lib/validator/sendMessageValidator";
import { TaskType } from "@google/generative-ai";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { PineconeStore } from "@langchain/pinecone";
import { NextRequest, NextResponse } from "next/server"; // Import NextResponse for streaming

export const POST = async (req: NextRequest) => {
  const body = await req.json();
  const { getUser } = getKindeServerSession();
  const user = await getUser();

  const { id: userId } = user;

  if (!userId) return new Response("Unauthorized", { status: 401 });

  const { fileId, message } = sendMessageValidator.parse(body);

  const file = await db.file.findFirst({
    where: {
      id: fileId,
      userId,
    },
  });

  if (!file) return new Response("Not Found", { status: 404 });

  await db.message.create({
    data: {
      text: message,
      isUserMessage: true,
      userId,
      fileId,
    },
  });

  const googleApiKey = process.env.GEMINI_API_KEY;
  if (!googleApiKey) {
    throw new Error(
      "GOOGLE_GENAI_API_KEY is not set in environment variables."
    );
  }

  // This part correctly uses text-embedding-004 for semantic search
  const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: googleApiKey,
    model: "text-embedding-004", // Correct model for embeddings
    taskType: TaskType.RETRIEVAL_DOCUMENT,
  });

  const pineconeClient = pinecone;
  const pineconeIndex = pineconeClient.Index("briefly");

  const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
    pineconeIndex,
    namespace: file.id,
  });

  const result = await vectorStore.similaritySearch(message, 4);

  const prevMessage = await db.message.findMany({
    where: {
      fileId,
    },
    orderBy: {
      createdAt: "asc",
    },
    take: 6,
  });

  // Format previous messages for Gemini's 'user' and 'model' roles
  const formattedMessages = prevMessage.map((msg) => ({
    role: msg.isUserMessage ? ("user" as const) : ("model" as const), // Gemini uses 'model' for assistant
    parts: [{ text: msg.text }], // Gemini expects 'parts' array
  }));

  // Combine context and previous conversation into the user's current prompt
  const combinedPrompt = `Use the following pieces of context (or previous conversation if needed) to answer the user's question in markdown format. If you don't know the answer, just say that you don't know, don't try to make up an answer.

PREVIOUS CONVERSATION:
${formattedMessages
  .map((msg) => {
    if (msg.role === "user") return `User: ${msg.parts[0].text}\n`;
    return `Assistant: ${msg.parts[0].text}\n`;
  })
  .join("")}

----------------

CONTEXT:
${result.map((r) => r.pageContent).join("\n\n")}

----------------

USER INPUT: ${message}`;

  // Prepare the history for the chat model
  // The last message is the current user input, which will be sent via sendMessageStream
  const chatHistory = [
    ...formattedMessages, // Add previous messages
    { role: "user", parts: [{ text: combinedPrompt }] }, // Add the current user prompt with context
  ];

  try {
    // Start the chat with the history (excluding the very last message, which is the current user input)
    // 'ai' is now directly the gemini-1.5-flash model instance
    const chat = ai.startChat({
      history: chatHistory.slice(0, -1), // All messages except the last one (current user input) form the history
    });

    // Send the current user input to the chat model
    const responseStream = await chat.sendMessageStream(
      chatHistory[chatHistory.length - 1].parts[0].text
    );

    let fullResponse = "";
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        for await (const chunk of responseStream.stream) {
          const text = chunk.text();
          fullResponse += text;
          controller.enqueue(encoder.encode(text));
        }
        // After the stream ends, save the full response to the database
        await db.message.create({
          data: {
            text: fullResponse,
            isUserMessage: false,
            fileId,
            userId,
          },
        });
        controller.close();
      },
    });

    // Return the stream to the client
    return new NextResponse(readableStream, {
      headers: {
        "Content-Type": "text/plain", // Or 'text/event-stream' if you're using SSE
      },
    });
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
};
