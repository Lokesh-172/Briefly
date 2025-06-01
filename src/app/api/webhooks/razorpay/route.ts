import { db } from '@/db' 
import crypto from 'crypto' 
import { NextRequest } from 'next/server' 
 
export async function POST(req: NextRequest) { 
  try { 
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET! 
    const signature = req.headers.get('x-razorpay-signature') || '' 
    const body = await req.text() 
    console.log(body); 
     
 
    // Secure signature validation 
    const expectedSignature = crypto 
      .createHmac('sha256', secret) 
      .update(body) 
      .digest('hex') 
 
    const isValidSignature = crypto.timingSafeEqual( 
      Buffer.from(signature, 'hex'), 
      Buffer.from(expectedSignature, 'hex') 
    ) 
 
    if (!isValidSignature) { 
      console.error('Invalid webhook signature') 
      return new Response('Invalid signature', { status: 400 }) 
    } 
 
    const event = JSON.parse(body) 
    console.log(event); 
 
    console.log('Webhook event received:', event.event) 
 
    // Handle payment.authorized event
    if (event.event === 'payment.authorized' && event.payload?.payment?.entity) {
      const paymentEntity = event.payload.payment.entity
      const orderId = paymentEntity.order_id
      const customerId = paymentEntity.customer_id

      if (!orderId) {
        console.error('Missing order ID in payment:', paymentEntity.id)
        return new Response('Missing order ID', { status: 400 })
      }

      try {
        // Fetch order details from Razorpay
        const orderRes = await fetch(
          `https://api.razorpay.com/v1/orders/${orderId}`,
          {
            method: 'GET',
            headers: {
              Authorization:
                'Basic ' +
                Buffer.from(
                  process.env.NEXT_PUBLIC_RAZORPAY_API_KEY + ':' + process.env.RAZORPAY_SECRET
                ).toString('base64'),
            },
          }
        )

        if (!orderRes.ok) {
          throw new Error(`Razorpay Order API error: ${orderRes.status}`)
        }

        const order = await orderRes.json()
        console.log('Order details:', order)

        // Get customer ID from order notes or payment
        const orderCustomerId = order.notes?.customerId || customerId
        
        if (orderCustomerId) {
          console.log('Customer ID found:', orderCustomerId)

          // Fetch all subscriptions and filter by customer (since direct customer filter might not be supported)
          const subscriptionsRes = await fetch(
            `https://api.razorpay.com/v1/subscriptions`,
            {
              method: 'GET',
              headers: {
                Authorization:
                  'Basic ' +
                  Buffer.from(
                    process.env.NEXT_PUBLIC_RAZORPAY_API_KEY + ':' + process.env.RAZORPAY_SECRET
                  ).toString('base64'),
              },
            }
          )

          if (!subscriptionsRes.ok) {
            throw new Error(`Razorpay Subscriptions API error: ${subscriptionsRes.status}`)
          }

          const subscriptionsData = await subscriptionsRes.json()
          console.log('All subscriptions fetched, filtering by customer ID')

          // Filter subscriptions by customer ID
          const customerSubscriptions = subscriptionsData.items?.filter(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (sub: any) => sub.customer_id === orderCustomerId
          ) || []

          console.log('Customer subscriptions found:', customerSubscriptions.length)
          console.log('Customer subscriptions:', customerSubscriptions)

          if (customerSubscriptions.length === 0) {
            console.log('No subscriptions found for customer:', orderCustomerId)
            return new Response(null, { status: 200 })
          }

          // Get the most recent active subscription, or the most recently created one
          const activeSubscription = customerSubscriptions.find(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (sub: any) => sub.status === 'active' || sub.status === 'authenticated'|| sub.status ==='created'
          ) || customerSubscriptions.sort((a: any, b: any) => b.created_at - a.created_at)[0]

          if (activeSubscription) {
            console.log('Subscription found:', activeSubscription)

          if (!activeSubscription.id || !activeSubscription.plan_id || !activeSubscription.current_end) {
            console.error('Invalid subscription data:', activeSubscription)
            return new Response('Invalid subscription data', { status: 400 })
          }

          // Update user subscription details in your DB
          await db.user.update({
            where: {
              razorpayCustomerId: orderCustomerId,
            },
            data: {
              razorpaySubscriptionId: activeSubscription.id,
              razorpayPriceId: activeSubscription.plan_id,
              razorpayCurrentPeriodEnd: new Date(activeSubscription.current_end * 1000),
            },
          })

          console.log('Successfully updated user subscription for customer:', orderCustomerId)
        } else {
          console.log('No subscriptions found for customer:', orderCustomerId)
        }
      } else {
        console.log('No customer ID found in order or payment')
      }

      } catch (apiError) {
        console.error('Error processing payment.authorized webhook:', apiError)
        return new Response('Internal server error', { status: 500 })
      }
    } else {
      console.log('Unhandled event type or missing payment payload:', event.event)
    }
 
    return new Response(null, { status: 200 }) 
  } catch (error) { 
    console.error('Webhook processing error:', error) 
    return new Response('Internal server error', { status: 500 }) 
  } 
}