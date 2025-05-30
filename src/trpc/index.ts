import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { privateProcedure, publicProcedure, router } from "./trpc";
import { TRPCError } from "@trpc/server";
import { db } from "@/db";
import { z } from "zod";
import { UTApi } from "uploadthing/server";
import { INFINITE_QUERY_LIMT } from "@/config/infinite-query";
import pinecone from "@/lib/pinecone";

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
          fileId: file.id
        }
      })
      const index = pinecone.Index('briefly');
      const namespace = index.namespace(file.id)
      await namespace.deleteAll()


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
      if(!file) return {status : "PENDING" as const}
      
      return {status: file.uploadStaus}
    }),

    getFileMessages: privateProcedure.input(z.object({
      limit: z.number().min(1).max(100).nullish(),
      cursor: z.string().nullish(),
      fileId: z.string(),
    })).query(async ({ input, ctx }) => {
      const { cursor, fileId } = input;
      const { userId } = ctx;
      const limit = input?.limit ?? INFINITE_QUERY_LIMT;
      const file = await db.file.findFirst({
        where:{
          id: fileId,
          userId,
        }
      })
      if(!file) throw new TRPCError({ code: "NOT_FOUND" });
      const messages = await db.message.findMany({
        take:limit+1,
        where:{
          fileId,
        },
        orderBy: {
          createdAt: "desc",
        },
        cursor: cursor ? { id: cursor } : undefined,
        select:{
          id: true,
          isUserMessage: true,
          createdAt: true,
          text: true,
        }
      })
      let nextCursor: typeof cursor | undefined = undefined;
      if(messages.length > limit) {
        const nextItem = messages.pop();
        nextCursor = nextItem?.id;
      }

      return{
        messages,
        nextCursor
      }
    }
  ),

});
// Export type router type signature,
// NOT the router itself.
export type AppRouter = typeof appRouter;
