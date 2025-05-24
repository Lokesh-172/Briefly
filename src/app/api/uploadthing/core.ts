import { db } from "@/db";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { createUploadthing, type FileRouter } from "uploadthing/next";
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
// Ensure this import correctly points to your Pinecone client instance
import pinecone from "@/lib/pinecone";
import { PineconeStore } from '@langchain/pinecone';
import { TaskType } from "@google/generative-ai";

const f = createUploadthing();

export const ourFileRouter = {
  pdfUploader: f({
    pdf: {
      maxFileSize: "4MB",
      maxFileCount: 1,
    },
  })
    .middleware(async ({ req }) => {
      const { getUser } = getKindeServerSession();
      const user = await getUser();

      if (!user || !user.id) {
        console.error("Authentication Error: User not found or ID missing.");
        throw new Error("Unauthorised");
      }

      console.log("User authenticated:", user.id);
      return { userId: user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      let createdFileId: string | undefined;

      try {
        const createdFile = await db.file.create({
          data: {
            key: file.key,
            name: file.name,
            userId: metadata.userId,
            url: file.ufsUrl,
            uploadStaus: "PROCESSING",
          },
        });
        createdFileId = createdFile.id;

        // Fetch the PDF file
        const response = await fetch(file.ufsUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch PDF: ${response.statusText} (${response.status})`);
        }
        const blob = await response.blob();

        // Load PDF document
        const loader = new PDFLoader(blob);
        const pageLevelDocs = await loader.load();
        const pageAmt = pageLevelDocs.length;
        // Initialize embeddings
        const googleApiKey = process.env.GEMINI_API_KEY;
        if (!googleApiKey) {
          throw new Error("GOOGLE_GENAI_API_KEY is not set in environment variables.");
        }
        const embeddings = new GoogleGenerativeAIEmbeddings({
          apiKey: googleApiKey,
          model: "text-embedding-004",
          taskType: TaskType.RETRIEVAL_DOCUMENT,
          title: file.name,
        });

        // Initialize Pinecone and store documents
        const pineconeClient = pinecone; // Use the imported Pinecone client instance directly
        const pineconeIndex = pineconeClient.Index("briefly"); // Get the specific index

        console.log(`Storing documents in Pinecone with namespace: ${createdFile.id}`);
        await PineconeStore.fromDocuments(pageLevelDocs, embeddings, {
          pineconeIndex,
          namespace: createdFile.id,
        });

        // Update file status to SUCCESS
        if (createdFileId) {
          await db.file.update({
            data: {
              uploadStaus: "SUCCESS",
            },
            where: {
              id: createdFileId,
            },
          });
        }

      } catch (error) {

        // Update file status to FAILED if an ID is available
        if (createdFileId) {
          await db.file.update({
            data: {
              uploadStaus: "FAILED",
            },
            where: {
              id: createdFileId,
            },
          });
        }
      }
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;