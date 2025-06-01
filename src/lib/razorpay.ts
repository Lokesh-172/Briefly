import { PLANS } from "@/config/razorpay";
import { db } from "@/db";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import Razorpay from "razorpay";

export const razorpay = new Razorpay({
  key_id: process.env.NEXT_PUBLIC_RAZORPAY_API_KEY ,
  key_secret: process.env.RAZORPAY_SECRET,
});

export async function getUserSubscriptionPlan() {
  const { getUser } = getKindeServerSession();
  const user = await getUser();

  if (!user || !user.id) {
    return {
      ...PLANS[0], // Free plan
      isSubscribed: false,
      isCanceled: false,
      razorpayCurrentPeriodEnd: null,
    };
  }
  const dbUser = await db.user.findFirst({
    where: {
      id: user.id,
    },
  });
console.log(dbUser);


  if (!dbUser || !dbUser.razorpaySubscriptionId) {
    return {
      ...PLANS[0],
      isSubscribed: false,
      isCanceled: false,
      razorpayCurrentPeriodEnd: null,
    };
  }
  

  try {
    const subscription = await razorpay.subscriptions.fetch(
      dbUser.razorpaySubscriptionId
    );
      console.log(subscription);
      
    const isSubscribed =
      subscription.status === "active" ||
      subscription.status === "authenticated" ||
      subscription.status === "created";
    const isCanceled = subscription.status === "cancelled";
    return {
      ...PLANS[1], // Pro plan
      isSubscribed,
      isCanceled,
      razorpayCurrentPeriodEnd: subscription.current_end
        ? new Date(subscription.current_end * 1000)
        : null,
    };
  } catch (err) {
    console.error("Error fetching Razorpay subscription:", err);
    return {
      ...PLANS[0],
      isSubscribed: false,
      isCanceled: false,
      razorpayCurrentPeriodEnd: null,
    };
  }
}
