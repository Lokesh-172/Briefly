import BillingForm from "@/components/BillingForm"
import { getUserSubscriptionPlan } from "@/lib/razorpay"

const Page = async () => {
    const subscriptionPlan = await getUserSubscriptionPlan()

    return <BillingForm subscriptionPlan={subscriptionPlan} /> 
}

export default Page