import { db } from "@/db";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { createUploadthing, type FileRouter } from "uploadthing/next";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
// Ensure this import correctly points to your Pinecone client instance
import pinecone from "@/lib/pinecone";
import { PineconeStore } from "@langchain/pinecone";
import { TaskType } from "@google/generative-ai";
import { getUserSubscriptionPlan } from "@/lib/razorpay";
import { PLANS } from "@/config/razorpay";

const f = createUploadthing();

const middleware = async () => {
  const { getUser } = getKindeServerSession();
  const user = await getUser();

  if (!user || !user.id) throw new Error("Unauthorized");

  const subscriptionPlan = await getUserSubscriptionPlan();

  return { subscriptionPlan, userId: user.id };
};

const onUploadComplete = async ({
  metadata,
  file,
}: {
  metadata: Awaited<ReturnType<typeof middleware>>;
  file: {
    key: string;
    name: string;
    ufsUrl: string;
  };
}) => {
  const isFileExist = await db.file.findFirst({
    where: {
      key: file.key,
    },
  });
  if (isFileExist) return;
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
      throw new Error(
        `Failed to fetch PDF: ${response.statusText} (${response.status})`,
      );
    }
    const blob = await response.blob();

    // Load PDF document
    const loader = new PDFLoader(blob);
    const pageLevelDocs = await loader.load();

    // Filter out empty documents (pages with no text content)
    const validDocs = pageLevelDocs.filter(
      (doc) => doc.pageContent && doc.pageContent.trim().length > 0,
    );

    console.log(
      `Total pages: ${pageLevelDocs.length}, Pages with text: ${validDocs.length}`,
    );

    if (validDocs.length === 0) {
      console.log("No extractable text found in PDF");
      await db.file.update({
        data: {
          uploadStaus: "FAILED",
        },
        where: {
          id: createdFile.id,
        },
      });
      return;
    }

    const { subscriptionPlan } = metadata;
    const { isSubscribed } = subscriptionPlan;
    const pagesAmt = pageLevelDocs.length;

    const isProExceeded =
      pagesAmt > PLANS.find((plan) => plan.name === "Pro")!.pagesPerPdf;
    const isFreeExceeded =
      pagesAmt > PLANS.find((plan) => plan.name === "Free")!.pagesPerPdf;

    if ((isSubscribed && isProExceeded) || (!isSubscribed && isFreeExceeded)) {
      await db.file.update({
        data: {
          uploadStaus: "FAILED",
        },
        where: {
          id: createdFile.id,
        },
      });
      return;
    }

    // Initialize embeddings
    const googleApiKey = process.env.GEMINI_API_KEY;
    if (!googleApiKey) {
      throw new Error(
        "GOOGLE_GENAI_API_KEY is not set in environment variables.",
      );
    }
    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: googleApiKey,
      model: "gemini-embedding-001",
      taskType: TaskType.RETRIEVAL_DOCUMENT,
      title: file.name,
    });

    // Initialize Pinecone and store documents
    const pineconeClient = pinecone; // Use the imported Pinecone client instance directly
    const pineconeIndex = pineconeClient.Index("briefly-3072"); // Get the specific index

    console.log(
      `Storing documents in Pinecone with namespace: ${createdFile.id}`,
    );
    await PineconeStore.fromDocuments(validDocs, embeddings, {
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
    console.log(error);
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
};

export const ourFileRouter = {
  freePlanUploader: f({ pdf: { maxFileSize: "4MB" } })
    .middleware(middleware)
    .onUploadComplete(onUploadComplete),
  proPlanUploader: f({ pdf: { maxFileSize: "16MB" } })
    .middleware(middleware)
    .onUploadComplete(onUploadComplete),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
