import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { privateProcedure, publicProcedure, router } from "./trpc";
import { TRPCError } from "@trpc/server";
import { db } from "@/db";
import { z } from "zod";
import { UTApi } from "uploadthing/server";

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
});
// Export type router type signature,
// NOT the router itself.
export type AppRouter = typeof appRouter;
