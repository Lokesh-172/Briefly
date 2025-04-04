import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { publicProcedure, router } from "./trpc";
import { TRPCError } from "@trpc/server";
import { db } from "@/db";

export const appRouter = router({
  // ...
  authCallback: publicProcedure.query(async () => {
    const { getUser } = getKindeServerSession();
    const user = await getUser();

    if (!user || !user.id || !user.email || !user.family_name || !user.given_name) {
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
          lastName : user.family_name,
          firstName: user.given_name
        },
      });
    }
    return { success : true} 
  }),
});
// Export type router type signature,
// NOT the router itself.
export type AppRouter = typeof appRouter;
