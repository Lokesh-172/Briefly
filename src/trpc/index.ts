import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { privateProcedure, publicProcedure, router } from "./trpc";
import { TRPCError } from "@trpc/server";
import { db } from "@/db";
import { z } from "zod";
import { UTApi } from "uploadthing/server";
import { INFINITE_QUERY_LIMT } from "@/config/infinite-query";
import pinecone from "@/lib/pinecone";
import { getUserSubscriptionPlan, razorpay } from "@/lib/razorpay";
import { PLANS } from "@/config/razorpay";

export const appRouter = router({
  // ...

  authCallback: publicProcedure.query(async () => {
    const { getUser } = getKindeServerSession();
    const user = await getUser();

    if (
      !user ||
      !user.id ||
      !user.email ||
      !user.family_name ||
      !user.given_name
    ) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    // check if the user is in the database
    const dbUser = await db.user.findFirst({
      where: {
        id: user.id,
      },
    });
    if (!dbUser) {
      // Not in database
      // Create one
      await db.user.create({
        data: {
          id: user.id,
          email: user.email,
          lastName: user.family_name,
          firstName: user.given_name,
        },
      });
    }
    return { success: true };
  }),
  getUserFiles: privateProcedure.query(async ({ ctx }) => {
    const { userId } = ctx;
    return await db.file.findMany({
      where: {
        userId,
      },
    });
  }),
  deleteFiles: privateProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { userId } = ctx;
      const file = await db.file.findFirst({
        where: {
          id: input.id,
          userId,
        },
      });

      if (!file) throw new TRPCError({ code: "NOT_FOUND" });
      const utapi = new UTApi();
      await utapi.deleteFiles(file.key);
      await db.file.delete({
        where: {
          id: input.id,
        },
      });
      await db.message.deleteMany({
        where: {
          fileId: file.id,
        },
      });
      const index = pinecone.Index("briefly");
      const namespace = index.namespace(file.id);
      await namespace.deleteAll();
    }),
  getFile: privateProcedure
    .input(z.object({ key: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { userId } = ctx;

      const file = await db.file.findFirst({
        where: {
          key: input.key,
          userId,
        },
      });
      if (!file) throw new TRPCError({ code: "NOT_FOUND" });

      return file;
    }),

  getFileUploadStatus: privateProcedure
    .input(z.object({ fileId: z.string() }))
    .query(async ({ input, ctx }) => {
      const file = await db.file.findFirst({
        where: {
          id: input.fileId,
          userId: ctx.userId,
        },
      });
      if (!file) return { status: "PENDING" as const };

      return { status: file.uploadStaus };
    }),

  getFileMessages: privateProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).nullish(),
        cursor: z.string().nullish(),
        fileId: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { cursor, fileId } = input;
      const { userId } = ctx;
      const limit = input?.limit ?? INFINITE_QUERY_LIMT;
      const file = await db.file.findFirst({
        where: {
          id: fileId,
          userId,
        },
      });
      if (!file) throw new TRPCError({ code: "NOT_FOUND" });
      const messages = await db.message.findMany({
        take: limit + 1,
        where: {
          fileId,
        },
        orderBy: {
          createdAt: "desc",
        },
        cursor: cursor ? { id: cursor } : undefined,
        select: {
          id: true,
          isUserMessage: true,
          createdAt: true,
          text: true,
        },
      });
      let nextCursor: typeof cursor | undefined = undefined;
      if (messages.length > limit) {
        const nextItem = messages.pop();
        nextCursor = nextItem?.id;
      }

      return {
        messages,
        nextCursor,
      };
    }),

 // In your TRPC router file (e.g., src/trpc/index.ts or similar)

createRazorpaySession: privateProcedure.mutation(async ({ ctx }) => {
  const { userId } = ctx;
  const billingUrl = ("/dashboard/billing");

  if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

  const dbUser = await db.user.findFirst({
    where: { id: userId },
  });
  
  if (!dbUser) throw new TRPCError({ code: "UNAUTHORIZED" });

  const subscriptionPlan = await getUserSubscriptionPlan();

  // Already subscribed case
  console.log(subscriptionPlan);
  
  if (subscriptionPlan.isSubscribed) {
    return { 
      subscriptionId: null,
      planId: null,
      customerId: null,
      customerDetails: null,
      billingUrl,
      isAlreadySubscribed: true 
    };
  }

  // Get Pro plan details
  const plan = PLANS.find((plan) => plan.name === "Pro");
  if (!plan) throw new TRPCError({ 
    code: "INTERNAL_SERVER_ERROR", 
    message: "Plan not found" 
  });

  try {
    let customerId = dbUser.razorpayCustomerId;

    // Create Razorpay customer if doesn't exist
    if (!customerId) {
      const customer = await razorpay.customers.create({
        name: dbUser.firstName || "Customer",
        email: dbUser.email,
        contact: undefined,
      });
      
      customerId = customer.id;
      
      await db.user.update({
        where: { id: userId },
        data: { razorpayCustomerId: customerId },
      });
    }

    // Create Razorpay Subscription
    const subscription = await razorpay.subscriptions.create({
      plan_id: plan.price.priceIds.test, // You'll need to add this to your PLANS config
      customer_notify: true,
      quantity: 1,
      total_count: 12, // For annual subscription, adjust as needed
      // start_at: omitted - will start immediately after first payment
      notes: {
        userId: userId,
        planType: plan.name,
        customerId: customerId,
      },
    });

    return {
      subscriptionId: subscription.id,
      planId: subscription.plan_id,
      customerId: customerId,
      customerDetails: {
        name: dbUser.firstName || "Customer",
        email: dbUser.email,
        contact: undefined,
      },
      billingUrl,
      isAlreadySubscribed: false,
      status: subscription.status,
      currentStart: subscription.current_start,
      currentEnd: subscription.current_end,
    };

  } catch (error) {
    console.error("Razorpay subscription creation failed:", error);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to create subscription. Please try again.",
    });
  }
}),
});
// Export type router type signature,
// NOT the router itself.
export type AppRouter = typeof appRouter;
