"use client"

import { ArrowRight } from 'lucide-react'
import { Button } from './ui/button'
import { trpc } from '@/app/_trpc/client'
import { toast } from 'sonner' // Make sure you have sonner installed
import { useState } from 'react'

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Razorpay: any;
  }
}

const UpgradeButton = () => {
  const [isLoading, setIsLoading] = useState(false)

  const { mutate: createRazorpaySession } = trpc.createRazorpaySession.useMutation({
    onSuccess: (data) => {
      setIsLoading(false)
      
      if (data.isAlreadySubscribed) {
        toast.info("You're already subscribed!")
        window.location.href = data.billingUrl
        return
      }
      const razorpayAPIKEY = process.env.NEXT_PUBLIC_RAZORPAY_API_KEY ;
      if(!razorpayAPIKEY){
        toast.error( "NO API KEY")
      }
      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_API_KEY ,
        amount: data.amount,
        currency: data.currency,
        name: "Briefly", // Replace with your app name
        description: "Pro Plan Subscription",
        order_id: data.orderId,
        prefill: {
          name: data.customerDetails?.name,
          email: data.customerDetails?.email,
        },
        theme: {
          color: "#3399cc", // Your brand color
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        handler: function (response: any) {
          toast.success("Payment successful! Activating your subscription...");
          console.log(response);

          window.location.href = data.billingUrl
        },
        modal: {
          ondismiss: function() {
            toast.info("Payment cancelled")
          }
        }
      }
      const razorpay = new window.Razorpay(options)
      razorpay.open()
    },
    onError: (error) => {
      setIsLoading(false)
      toast.error(error.message || "Something went wrong")
    }
  })

  const handleUpgrade = async () => {
    setIsLoading(true)
    
    // Load Razorpay script if not loaded
    if (!window.Razorpay) {
      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.onload = () => {
        createRazorpaySession()
      }
      script.onerror = () => {
        setIsLoading(false)
        toast.error("Failed to load payment gateway")
      }
      document.body.appendChild(script)
    } else {
      createRazorpaySession()
    }
  }

  return (
    <Button 
      onClick={handleUpgrade}
      disabled={isLoading}
      className='w-full'
    >
      {isLoading ? "Processing..." : (
        <>
          Upgrade now <ArrowRight className='h-5 w-5 ml-1.5' />
        </>
      )}
    </Button>
  )
}

export default UpgradeButton