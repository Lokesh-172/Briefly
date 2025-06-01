"use client";

import { ArrowRight } from "lucide-react";
import { Button } from "./ui/button";
import { trpc } from "@/app/_trpc/client";
import { toast } from "sonner";
import { useState } from "react";

declare global {
  interface Window {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Razorpay: any;
  }
}

const UpgradeButton = () => {
  const [isLoading, setIsLoading] = useState(false);

  const { mutate: createRazorpaySession } = trpc.createRazorpaySession.useMutation({
    onSuccess: (data) => {
      setIsLoading(false);

      if (data.isAlreadySubscribed) {
        toast.info("You're already subscribed!");
        window.location.href = data.billingUrl;
        return;
      }

      const razorpayKey = process.env.NEXT_PUBLIC_RAZORPAY_API_KEY!;
      if (!razorpayKey) {
        toast.error("Razorpay API key missing");
        return;
      }

      const options = {
        key: razorpayKey,
        name: "Briefly",
        description: "Pro Plan Subscription",
        subscription_id: data.subscriptionId,
        prefill: {
          name: data.customerDetails?.name,
          email: data.customerDetails?.email,
        },
        theme: {
          color: "#3399cc",
        },
        handler: function () {
          // Response will contain razorpay_payment_id, razorpay_subscription_id, razorpay_signature
          toast.success("Subscription activated successfully!");
          
          // You might want to verify the subscription on your backend here
          // before redirecting to billing
          window.location.href = data.billingUrl;
        },
        modal: {
          ondismiss: function () {
            toast.info("Subscription setup cancelled");
          },
        },
        subscription: {
          // Additional subscription-specific options
          auth_type: "otp", // or "netbanking" based on your preference
        },
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();
    },
    onError: (error) => {
      setIsLoading(false);
      toast.error(error.message || "Something went wrong");
    },
  });

  const handleUpgrade = async () => {
    setIsLoading(true);

    if (!window.Razorpay) {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => createRazorpaySession();
      script.onerror = () => {
        setIsLoading(false);
        toast.error("Failed to load payment gateway");
      };
      document.body.appendChild(script);
    } else {
      createRazorpaySession();
    }
  };

  return (
    <Button onClick={handleUpgrade} disabled={isLoading} className="w-full">
      {isLoading ? "Setting up subscription..." : (
        <>
          Upgrade now <ArrowRight className="h-5 w-5 ml-1.5" />
        </>
      )}
    </Button>
  );
};

export default UpgradeButton;