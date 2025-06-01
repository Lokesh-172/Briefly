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

        // Check if order has subscription linked to it
        const subscriptionId = order.notes?.subscription_id || order.receipt?.includes('sub_') ? order.receipt : null

        if (subscriptionId) {
          console.log('Subscription found in order:', subscriptionId)

          // Fetch subscription details
          const subscriptionRes = await fetch(
            `https://api.razorpay.com/v1/subscriptions/${subscriptionId}`,
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

          if (!subscriptionRes.ok) {
            throw new Error(`Razorpay Subscription API error: ${subscriptionRes.status}`)
          }

          const subscription = await subscriptionRes.json()
          console.log('Subscription details:', subscription)

          if (!subscription.id || !subscription.plan_id || !subscription.current_end) {
            console.error('Invalid subscription data:', subscription)
            return new Response('Invalid subscription data', { status: 400 })
          }

          // Use customer ID from subscription or payment
          const finalCustomerId = subscription.customer_id || customerId

          if (!finalCustomerId) {
            console.error('No customer ID found in subscription or payment')
            return new Response('Missing customer ID', { status: 400 })
          }

          // Update user subscription details in your DB
          await db.user.update({
            where: {
              razorpayCustomerId: finalCustomerId,
            },
            data: {
              razorpaySubscriptionId: subscription.id,
              razorpayPriceId: subscription.plan_id,
              razorpayCurrentPeriodEnd: new Date(subscription.current_end * 1000),
            },
          })

          console.log('Successfully updated user subscription for customer:', finalCustomerId)
        } else {
          console.log('No subscription linked to this order:', orderId)
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